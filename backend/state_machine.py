"""
Request status state machine.

    Requested → Accepted → On the Way → In Progress → Completed
        │            │
        │            └→ Cancelled   (customer, before the job starts)
        └→ Rejected  (provider declines; triggers auto-reassignment)

Validation is a single dict + set lookup, so it is O(1) and cannot drift out of
sync with the UI: the frontend asks this same table (via /api/status-flow) for
the buttons it renders.
"""

STATUS_REQUESTED = "Requested"
STATUS_ACCEPTED = "Accepted"
STATUS_ON_THE_WAY = "On the Way"
STATUS_IN_PROGRESS = "In Progress"
STATUS_WORK_DONE = "Work Done"
STATUS_COMPLETED = "Completed"
STATUS_DISPUTED = "Disputed"
STATUS_REFUNDED = "Refunded"
STATUS_REJECTED = "Rejected"
STATUS_CANCELLED = "Cancelled"

ALLOWED_TRANSITIONS: dict[str, set[str]] = {
    STATUS_REQUESTED: {STATUS_ACCEPTED, STATUS_REJECTED, STATUS_CANCELLED},
    STATUS_ACCEPTED: {STATUS_ON_THE_WAY, STATUS_CANCELLED},
    STATUS_ON_THE_WAY: {STATUS_IN_PROGRESS},
    STATUS_IN_PROGRESS: {STATUS_WORK_DONE, STATUS_COMPLETED},
    STATUS_WORK_DONE: {STATUS_COMPLETED, STATUS_DISPUTED},
    STATUS_DISPUTED: {STATUS_COMPLETED, STATUS_REFUNDED},
    STATUS_COMPLETED: set(),
    STATUS_REFUNDED: set(),
    STATUS_REJECTED: set(),
    STATUS_CANCELLED: set(),
}

# The happy path, in order — used by the tracking timeline.
PROGRESS_FLOW = [
    STATUS_REQUESTED,
    STATUS_ACCEPTED,
    STATUS_ON_THE_WAY,
    STATUS_IN_PROGRESS,
    STATUS_WORK_DONE,
    STATUS_COMPLETED,
]

# Which side of the marketplace is allowed to trigger each transition.
ACTOR_BY_STATUS = {
    STATUS_ACCEPTED: "provider",
    STATUS_REJECTED: "provider",
    STATUS_ON_THE_WAY: "provider",
    STATUS_IN_PROGRESS: "provider",
    STATUS_WORK_DONE: "provider",
    STATUS_COMPLETED: "customer",
    STATUS_DISPUTED: "customer",
    STATUS_REFUNDED: "admin",
    STATUS_CANCELLED: "customer",
}

# Status → the timestamp column stamped when it is first reached.
TIMESTAMP_FIELD = {
    STATUS_ACCEPTED: "accepted_at",
    STATUS_ON_THE_WAY: "on_the_way_at",
    STATUS_IN_PROGRESS: "in_progress_at",
    STATUS_WORK_DONE: "work_done_at",
    STATUS_COMPLETED: "completed_at",
    STATUS_DISPUTED: "dispute_created_at",
    STATUS_REFUNDED: "dispute_resolved_at",
}

TERMINAL_STATUSES = {STATUS_COMPLETED, STATUS_REFUNDED, STATUS_REJECTED, STATUS_CANCELLED}
ACTIVE_STATUSES = {
    STATUS_ACCEPTED,
    STATUS_ON_THE_WAY,
    STATUS_IN_PROGRESS,
    STATUS_WORK_DONE,
    STATUS_DISPUTED,
}


class InvalidTransitionError(Exception):
    """Raised for any status change the table above does not permit."""


def transition(current_status: str, new_status: str) -> str:
    """
    Validate a status change and return `new_status`.

    Raises:
        InvalidTransitionError: if the jump is not in ALLOWED_TRANSITIONS —
        including the direct `Requested → Completed` shortcut.

    Complexity: O(1).
    """
    if current_status not in ALLOWED_TRANSITIONS:
        raise InvalidTransitionError(f"Unknown status '{current_status}'")

    allowed = ALLOWED_TRANSITIONS[current_status]
    if new_status not in allowed:
        options = ", ".join(sorted(allowed)) or "nothing — this status is final"
        raise InvalidTransitionError(
            f"Cannot go from '{current_status}' to '{new_status}'. Allowed: {options}"
        )
    return new_status


def next_statuses(current_status: str, actor: str | None = None) -> list[str]:
    """
    Statuses reachable from `current_status`, optionally limited to those the
    given actor ("customer" / "provider") may trigger.

    Complexity: O(1) — the sets hold at most three entries.
    """
    allowed = ALLOWED_TRANSITIONS.get(current_status, set())
    if actor:
        allowed = {s for s in allowed if ACTOR_BY_STATUS.get(s) == actor}
    return sorted(allowed)


def progress_index(status: str) -> int:
    """Position on the happy path, or -1 for a status that left it."""
    return PROGRESS_FLOW.index(status) if status in PROGRESS_FLOW else -1
