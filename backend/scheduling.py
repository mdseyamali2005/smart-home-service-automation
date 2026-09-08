"""
Scheduling — double-booking prevention and the available-slot grid.

A provider is offered a slot only if **both** hold:
  1. the provider declared that (date, time_slot) as available, and
  2. nobody has booked it yet.

Data structure
--------------
    booked_slots: {(provider_id, date, time_slot) -> request_id}

A dict gives average O(1) check and insert, so slot conflicts stay cheap no
matter how many bookings pile up during a demo. The dict is rebuilt from the
database at startup (`restore_bookings`) — without that, restarting the server
would silently release every already-booked slot.

This module is deliberately free of FastAPI and SQLAlchemy imports so it can be
unit-tested on its own.
"""

# The canonical two-hour windows the whole app offers.
TIME_SLOTS: list[str] = [
    "08:00-10:00",
    "10:00-12:00",
    "12:00-14:00",
    "14:00-16:00",
    "16:00-18:00",
    "18:00-20:00",
]

# key: (provider_id, date, time_slot) -> request_id
booked_slots: dict[tuple[str, str, str], str] = {}

# Statuses that no longer hold a slot: the job is over, or was handed on.
_RELEASED_STATUSES = {"Completed", "Rejected", "Cancelled", "Refunded"}


class SlotConflictError(Exception):
    """Raised when a slot that is already booked is booked again."""


def has_free_slot(
    provider_id: str,
    date: str,
    time_slot: str,
    provider_available_slots: list[dict],
) -> bool:
    """
    True when the provider both declared this slot and has not booked it out.

    Complexity: O(s) over the provider's declared slots (a handful in practice)
    plus an O(1) booking lookup.
    """
    declared = any(
        slot.get("date") == date and slot.get("time_slot") == time_slot
        for slot in (provider_available_slots or [])
    )
    not_booked = (provider_id, date, time_slot) not in booked_slots
    return declared and not_booked


def book_slot(provider_id: str, date: str, time_slot: str, request_id: str) -> None:
    """
    Claim a slot for a request.

    Raises:
        SlotConflictError: the slot is already claimed by another request.

    Complexity: O(1) average.
    """
    key = (provider_id, date, time_slot)
    existing = booked_slots.get(key)
    if existing is not None and existing != request_id:
        raise SlotConflictError(
            f"Slot ({provider_id}, {date}, {time_slot}) is already booked "
            f"by request {existing}"
        )
    booked_slots[key] = request_id


def free_slot(provider_id: str, date: str, time_slot: str) -> None:
    """Release a slot — used when a provider rejects and the job moves on."""
    booked_slots.pop((provider_id, date, time_slot), None)


def is_booked(provider_id: str, date: str, time_slot: str) -> bool:
    """O(1) booking lookup, ignoring whether the slot was ever declared."""
    return (provider_id, date, time_slot) in booked_slots


def open_job_count(provider_id: str) -> int:
    """
    How many slots this provider currently holds — the workload signal fed into
    the matching score so busy providers stop winning every job.

    Complexity: O(b) over all bookings. Kept simple on purpose; b is small at
    demo scale and this runs once per candidate, not per comparison.
    """
    return sum(1 for pid, _, _ in booked_slots if pid == provider_id)


def restore_bookings(requests: list) -> int:
    """
    Rebuild `booked_slots` from persisted service requests at startup.

    `requests` is any iterable of objects exposing provider_id / date /
    time_slot / status / id — passed in by the caller so this module stays
    database-agnostic.

    Returns the number of slots restored. Complexity: O(r).
    """
    booked_slots.clear()
    restored = 0
    for req in requests:
        if not req.provider_id or req.status in _RELEASED_STATUSES:
            continue
        booked_slots[(req.provider_id, req.date, req.time_slot)] = req.id
        restored += 1
    return restored


def free_slots_for_provider(provider, dates: list[str]) -> list[dict]:
    """
    The provider's own declared-and-unbooked slots across `dates`.

    Complexity: O(s) over declared slots.
    """
    wanted = set(dates)
    return [
        slot
        for slot in (provider.available_slots or [])
        if slot.get("date") in wanted
        and not is_booked(provider.id, slot["date"], slot["time_slot"])
    ]


def availability_grid(
    providers: list,
    dates: list[str],
    target_provider_id: str | None = None,
) -> list[dict]:
    """
    Aggregate a customer-facing calendar: for every date, which time slots have
    at least one free provider, and determine whether unavailable slots are 'booked' or 'closed'.

    Returns:
        [{date, slots: [{time_slot, provider_count, available, status, reason, booked}]}, ...]

    Complexity: O(p·s) — providers times their declared slots.
    """
    # (date, time_slot) -> number of providers with that slot still free
    counts: dict[tuple[str, str], int] = {}
    # (date, time_slot) -> set of provider IDs who declared this slot
    declared_by: dict[tuple[str, str], set[str]] = {}
    # (date, time_slot) -> set of provider IDs who have this slot booked
    booked_by: dict[tuple[str, str], set[str]] = {}

    wanted_dates = set(dates)
    for provider in providers:
        for slot in (provider.available_slots or []):
            d = slot.get("date")
            ts = slot.get("time_slot")
            if d in wanted_dates and ts:
                declared_by.setdefault((d, ts), set()).add(provider.id)

        for d in dates:
            for ts in TIME_SLOTS:
                if is_booked(provider.id, d, ts):
                    booked_by.setdefault((d, ts), set()).add(provider.id)

        for slot in free_slots_for_provider(provider, dates):
            key = (slot["date"], slot["time_slot"])
            counts[key] = counts.get(key, 0) + 1

    is_single = bool(target_provider_id) or (len(providers) == 1)

    result = []
    for date in dates:
        day_slots = []
        for time_slot in TIME_SLOTS:
            key = (date, time_slot)
            free_count = counts.get(key, 0)

            if free_count > 0:
                avail = True
                status = "open"
                reason = "open"
                is_slot_booked = False
            else:
                avail = False
                if is_single:
                    target_pid = target_provider_id or (providers[0].id if providers else None)
                    is_slot_booked = target_pid in booked_by.get(key, set())
                    status = "booked" if is_slot_booked else "closed"
                    reason = status
                else:
                    is_slot_booked = len(booked_by.get(key, set())) > 0
                    status = "booked" if is_slot_booked else "closed"
                    reason = status

            day_slots.append(
                {
                    "time_slot": time_slot,
                    "provider_count": free_count,
                    "available": avail,
                    "status": status,
                    "reason": reason,
                    "booked": is_slot_booked,
                }
            )
        result.append({"date": date, "slots": day_slots})

    return result
