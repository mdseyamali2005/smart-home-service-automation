"""
Provider routes — the public catalog plus the logged-in provider's own portal.

Public
    GET   /api/categories
    GET   /api/providers
    GET   /api/providers/{provider_id}
    GET   /api/availability
    GET   /api/status-flow

Provider portal (token required, provider role)
    GET   /api/provider/me/jobs
    GET   /api/provider/me/stats
    GET   /api/provider/me/slots
    POST  /api/provider/me/slots
    DELETE/api/provider/me/slots
    PATCH /api/provider/me/profile
"""

from collections import defaultdict
from datetime import date, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from auth import require_provider
from models import Provider, ServiceRequest, User, get_db
from schemas import (
    AvailabilityOut,
    MessageOut,
    ProviderOut,
    ProviderProfileUpdate,
    ProviderStatsOut,
    ServiceRequestOut,
    SlotUpdate,
)
from scheduling import TIME_SLOTS, availability_grid, is_booked
from serializers import provider_out, requests_out
from state_machine import (
    ACTIVE_STATUSES,
    ALLOWED_TRANSITIONS,
    PROGRESS_FLOW,
    STATUS_CANCELLED,
    STATUS_COMPLETED,
    STATUS_REQUESTED,
)

router = APIRouter(prefix="/api", tags=["providers"])

CATEGORIES = [
    "Appliance & Gadget Repair",
    "Plumbing",
    "Electrical",
    "Cleaning & Pest Control",
    "Home Maintenance",
    "Moving & Shifting",
    "Car Care & Repair",
    "Personal Care",
]

# How far ahead the booking calendar runs.
AVAILABILITY_DAYS = 7

# Urgent work is surfaced first in the provider's queue.
URGENCY_RANK = {"Emergency": 0, "Urgent": 1, "Normal": 2}


def _my_provider(db: Session, user: User) -> Provider:
    """The Provider row owned by the logged-in user, or 404."""
    provider = db.query(Provider).filter(Provider.user_id == user.id).first()
    if not provider:
        raise HTTPException(status_code=404, detail="Provider profile not found")
    return provider


# --------------------------------------------------------------------------- #
# Public catalog
# --------------------------------------------------------------------------- #

@router.get("/categories")
def get_categories(db: Session = Depends(get_db)):
    """
    The eight service categories, each with a live provider count and the
    cheapest starting price — so the landing grid shows real numbers.

    Complexity: O(p) over all providers.
    """
    providers = db.query(Provider).filter(Provider.status == "approved").all()

    by_category: dict[str, list[Provider]] = defaultdict(list)
    for provider in providers:
        by_category[provider.service_type].append(provider)

    return {
        "categories": [
            {
                "name": name,
                "provider_count": len(by_category.get(name, [])),
                "starting_price": min(
                    (p.price for p in by_category.get(name, [])), default=0
                ),
                "average_rating": round(
                    sum(p.rating or 0 for p in by_category.get(name, []))
                    / max(1, len(by_category.get(name, []))),
                    1,
                ),
            }
            for name in CATEGORIES
        ]
    }


@router.get("/providers", response_model=list[ProviderOut])
def list_providers(
    service_type: str | None = Query(default=None),
    db: Session = Depends(get_db),
):
    """All approved providers, optionally filtered by category. Complexity: O(p)."""
    query = db.query(Provider).filter(Provider.status == "approved")
    if service_type:
        query = query.filter(Provider.service_type == service_type)
    return [provider_out(p) for p in query.order_by(Provider.rating.desc()).all()]


@router.get("/providers/{provider_id}", response_model=ProviderOut)
def get_provider(provider_id: str, db: Session = Depends(get_db)):
    """One provider profile. Complexity: O(1) — primary key lookup."""
    provider = db.query(Provider).filter(Provider.id == provider_id).first()
    if not provider:
        raise HTTPException(status_code=404, detail="Provider not found")
    return provider_out(provider)


@router.get("/availability", response_model=AvailabilityOut)
def get_availability(
    service_type: str = Query(...),
    days: int = Query(default=AVAILABILITY_DAYS, ge=1, le=14),
    provider_id: str | None = Query(default=None),
    db: Session = Depends(get_db),
):
    """
    The real booking calendar for a category or specific provider: which time slots still have at
    least one free provider, over the next `days` days.

    Complexity: O(p · s).
    """
    query = db.query(Provider).filter(
        Provider.service_type == service_type,
        Provider.status == "approved",
    )
    if provider_id:
        query = query.filter(Provider.id == provider_id)
    providers = query.all()

    if provider_id and not providers:
        # Check if provider exists under another service type or not approved
        prov = db.query(Provider).filter(Provider.id == provider_id).first()
        if prov and prov.status == "approved":
            providers = [prov]
            service_type = prov.service_type
        else:
            raise HTTPException(status_code=404, detail="Provider not found or not approved")

    today = date.today()
    dates = [(today + timedelta(days=offset)).isoformat() for offset in range(days)]

    return AvailabilityOut(
        service_type=service_type,
        days=availability_grid(providers, dates, target_provider_id=provider_id),
    )


@router.get("/status-flow")
def status_flow():
    """
    Expose the state machine so the UI renders exactly the transitions the
    server will accept — one source of truth, no duplicated button logic.
    """
    return {
        "flow": PROGRESS_FLOW,
        "transitions": {
            status: sorted(allowed) for status, allowed in ALLOWED_TRANSITIONS.items()
        },
        "time_slots": TIME_SLOTS,
    }


# --------------------------------------------------------------------------- #
# Provider portal
# --------------------------------------------------------------------------- #

@router.get("/provider/me/jobs", response_model=list[ServiceRequestOut])
def my_jobs(
    user: User = Depends(require_provider),
    db: Session = Depends(get_db),
):
    """
    Every job assigned to the logged-in provider.

    Ordering is the automation the challenge asks for: new requests first,
    emergencies above urgent above normal, then soonest scheduled slot. The
    provider never has to hunt for what needs attention.

    Complexity: O(r log r).
    """
    provider = _my_provider(db, user)
    jobs = (
        db.query(ServiceRequest)
        .filter(ServiceRequest.provider_id == provider.id)
        .all()
    )

    jobs.sort(
        key=lambda job: (
            0 if job.status == STATUS_REQUESTED else 1 if job.status in ACTIVE_STATUSES else 2,
            URGENCY_RANK.get(job.urgency, 3),
            job.date,
            job.time_slot,
        )
    )
    return requests_out(db, jobs, viewer=user)


@router.get("/provider/me/stats", response_model=ProviderStatsOut)
def my_stats(
    user: User = Depends(require_provider),
    db: Session = Depends(get_db),
):
    """
    Dashboard counters plus a seven-day earnings series for the chart.

    Complexity: O(r) over the provider's own jobs.
    """
    provider = _my_provider(db, user)
    jobs = (
        db.query(ServiceRequest)
        .filter(ServiceRequest.provider_id == provider.id)
        .all()
    )

    completed = [j for j in jobs if j.status == STATUS_COMPLETED]
    cancelled = [j for j in jobs if j.status == STATUS_CANCELLED]
    finished = len(completed) + len(cancelled)

    # Earnings for each of the last 7 days, oldest first.
    today = date.today()
    window = [(today - timedelta(days=offset)).isoformat() for offset in range(6, -1, -1)]
    earned_on: dict[str, int] = {day: 0 for day in window}
    for job in completed:
        day = (job.completed_at or job.created_at or datetime.utcnow()).date().isoformat()
        if day in earned_on:
            earned_on[day] += job.estimated_price or 0

    return ProviderStatsOut(
        total_jobs=len(jobs),
        pending=sum(1 for j in jobs if j.status == STATUS_REQUESTED),
        active=sum(1 for j in jobs if j.status in ACTIVE_STATUSES),
        completed=len(completed),
        cancelled=len(cancelled),
        total_earnings=sum(j.estimated_price or 0 for j in completed),
        average_rating=round(provider.rating or 0, 2),
        rating_count=provider.rating_count or 0,
        completion_rate=round(len(completed) / finished * 100, 1) if finished else 0.0,
        earnings_by_day=[{"date": day, "amount": earned_on[day]} for day in window],
    )


@router.get("/provider/me/slots")
def my_slots(
    days: int = Query(default=AVAILABILITY_DAYS, ge=1, le=14),
    user: User = Depends(require_provider),
    db: Session = Depends(get_db),
):
    """
    The provider's own calendar: for each upcoming date and standard slot,
    whether they publish it and whether it is already booked.

    Complexity: O(days · slots).
    """
    provider = _my_provider(db, user)
    declared = {
        (slot["date"], slot["time_slot"]) for slot in (provider.available_slots or [])
    }
    today = date.today()

    # Active bookings in DB for this provider
    active_jobs = (
        db.query(ServiceRequest)
        .filter(
            ServiceRequest.provider_id == provider.id,
            ServiceRequest.status.notin_(["Completed", "Rejected", "Cancelled", "Refunded"]),
        )
        .all()
    )
    booked_map = {(job.date, job.time_slot): job for job in active_jobs}

    days_list = []
    for offset in range(days):
        slot_date = (today + timedelta(days=offset)).isoformat()
        day_slots = []
        for time_slot in TIME_SLOTS:
            job = booked_map.get((slot_date, time_slot))
            booked = is_booked(provider.id, slot_date, time_slot) or (job is not None)
            booking_info = (
                {
                    "request_id": job.id,
                    "customer_name": job.customer_name,
                    "service_type": job.service_type,
                    "status": job.status,
                    "urgency": job.urgency,
                }
                if job
                else None
            )
            day_slots.append(
                {
                    "time_slot": time_slot,
                    "published": (slot_date, time_slot) in declared,
                    "booked": booked,
                    "booking_info": booking_info,
                }
            )
        days_list.append({"date": slot_date, "slots": day_slots})

    return {"days": days_list}


@router.post("/provider/me/slots", response_model=MessageOut)
def publish_slot(
    body: SlotUpdate,
    user: User = Depends(require_provider),
    db: Session = Depends(get_db),
):
    """Publish one slot. Idempotent. Complexity: O(s)."""
    provider = _my_provider(db, user)
    slots = list(provider.available_slots or [])

    if not any(s["date"] == body.date and s["time_slot"] == body.time_slot for s in slots):
        slots.append({"date": body.date, "time_slot": body.time_slot})
        slots.sort(key=lambda s: (s["date"], s["time_slot"]))
        provider.available_slots = slots
        db.commit()

    return MessageOut(message="Slot published")


@router.delete("/provider/me/slots", response_model=MessageOut)
def unpublish_slot(
    body: SlotUpdate,
    user: User = Depends(require_provider),
    db: Session = Depends(get_db),
):
    """
    Withdraw a slot — refused if a customer already booked it, since silently
    dropping a confirmed job is exactly the manual mess this app removes.

    Complexity: O(s).
    """
    provider = _my_provider(db, user)

    has_active_booking = is_booked(provider.id, body.date, body.time_slot) or bool(
        db.query(ServiceRequest)
        .filter(
            ServiceRequest.provider_id == provider.id,
            ServiceRequest.date == body.date,
            ServiceRequest.time_slot == body.time_slot,
            ServiceRequest.status.notin_(["Completed", "Rejected", "Cancelled", "Refunded"]),
        )
        .first()
    )
    if has_active_booking:
        raise HTTPException(
            status_code=409,
            detail="This slot is already booked — reject the job first if you cannot make it",
        )

    provider.available_slots = [
        slot
        for slot in (provider.available_slots or [])
        if not (slot["date"] == body.date and slot["time_slot"] == body.time_slot)
    ]
    db.commit()
    return MessageOut(message="Slot withdrawn")


@router.patch("/provider/me/profile", response_model=ProviderOut)
def update_profile(
    body: ProviderProfileUpdate,
    user: User = Depends(require_provider),
    db: Session = Depends(get_db),
):
    """
    Update business name, base price, service area, expertise or bio. Every
    change feeds straight back into the matching score.

    Complexity: O(1).
    """
    provider = _my_provider(db, user)

    if body.name is not None:
        provider.name = body.name
    if body.price is not None:
        provider.price = body.price
    if body.location is not None:
        provider.location = body.location.model_dump()
    if body.expertise_tags is not None:
        provider.expertise_tags = [
            tag.strip().lower().replace(" ", "_") for tag in body.expertise_tags if tag.strip()
        ][:10]
    if body.bio is not None:
        provider.bio = body.bio

    db.commit()
    db.refresh(provider)
    return provider_out(provider)
