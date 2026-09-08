"""
Service-request routes — matching, booking, tracking, status updates, rating,
notifications, and invoices.

Public
    GET  /api/service-requests/{id}           — polling by the customer
    GET  /api/service-requests/{id}/invoice   — fetch the invoice

Authenticated customer
    POST /api/match-preview
    POST /api/service-requests
    GET  /api/my/requests                     — full booking history
    POST /api/service-requests/{id}/cancel
    POST /api/service-requests/{id}/rate

Authenticated provider (gets requests through the provider router)
    PATCH /api/service-requests/{id}/status

All endpoints
    GET  /api/notifications
    POST /api/notifications/mark-read
"""

import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from auth import get_current_user, get_optional_user, require_customer, require_provider
from invoicing import generate_invoice
from matching import detect_urgency, find_best_matches, get_dynamic_price
from models import (
    Customer,
    Notification,
    Provider,
    ServiceRequest,
    User,
    get_db,
    ROLE_ADMIN,
    ROLE_CUSTOMER,
)
from notifications import (
    notify,
    notify_provider,
    status_message,
    unread_count,
)
from schemas import (
    DisputeCreateRequest,
    InvoiceOut,
    MatchCandidate,
    MatchPreviewRequest,
    MatchPreviewResponse,
    MessageOut,
    NotificationOut,
    ProviderOut,
    RatingRequest,
    ServiceRequestCreate,
    ServiceRequestOut,
    StatusUpdateRequest,
)
from scheduling import (
    SlotConflictError,
    book_slot,
    free_slot,
    has_free_slot,
)
from serializers import provider_out, request_out, requests_out
from state_machine import (
    STATUS_CANCELLED,
    STATUS_COMPLETED,
    STATUS_DISPUTED,
    STATUS_REFUNDED,
    STATUS_REJECTED,
    STATUS_REQUESTED,
    STATUS_WORK_DONE,
    TIMESTAMP_FIELD,
    InvalidTransitionError,
    transition,
)

router = APIRouter(prefix="/api", tags=["requests"])


def _req_or_404(db: Session, request_id: str) -> ServiceRequest:
    req = db.query(ServiceRequest).filter(ServiceRequest.id == request_id).first()
    if not req:
        raise HTTPException(status_code=404, detail="Service request not found")
    return req


def _provider_or_404(db: Session, provider_id: str) -> Provider:
    provider = db.query(Provider).filter(Provider.id == provider_id).first()
    if not provider:
        raise HTTPException(status_code=404, detail="Provider not found")
    return provider


# --------------------------------------------------------------------------- #
# Matching
# --------------------------------------------------------------------------- #

@router.post("/match-preview", response_model=MatchPreviewResponse)
def match_preview(
    req: MatchPreviewRequest,
    db: Session = Depends(get_db),
    _user: User | None = Depends(get_optional_user),
):
    """
    Score providers and return the top 3 WITHOUT booking anything. The frontend
    shows these results; the user picks one and then calls /service-requests.

    Complexity: O(n) filter + O(m log m) sort.
    """
    providers = db.query(Provider).all()

    matches = find_best_matches(
        service_type=req.service_type,
        location=req.location.model_dump(),
        date=req.date,
        time_slot=req.time_slot,
        urgency=req.urgency,
        providers=providers,
        problem_details=req.problem_details,
    )

    suggested_urgency = detect_urgency(req.problem_details)

    return MatchPreviewResponse(
        candidates=[
            MatchCandidate(
                provider=provider_out(m["provider"]),
                match_score=m["match_score"],
                base_price=m["base_price"],
                estimated_price=m["estimated_price"],
                distance_km=m["distance_km"],
                eta_minutes=m["eta_minutes"],
                open_jobs=m["open_jobs"],
                breakdown=m["breakdown"],
                weights=m["weights"],
                tags=m["tags"],
            )
            for m in matches
        ],
        suggested_urgency=suggested_urgency,
        total_considered=len(providers),
    )


# --------------------------------------------------------------------------- #
# Create / book
# --------------------------------------------------------------------------- #

@router.post("/service-requests", response_model=ServiceRequestOut, status_code=201)
def create_service_request(
    req: ServiceRequestCreate,
    db: Session = Depends(get_db),
    user: User | None = Depends(get_optional_user),
):
    """
    Confirm a booking.

    - If `chosen_provider_id` is omitted, the best-matching provider is picked
      automatically (auto-assign bonus feature).
    - Slot is re-checked right before booking to guard against the race between
      preview and confirm. If it was taken, the next-best alternative is returned
      as a 409 payload so the UI can show it without a second API call.

    Complexity: O(1) main path; O(n filter + m log m sort) only on conflict.
    """
    providers = db.query(Provider).all()

    if req.chosen_provider_id:
        provider = _provider_or_404(db, req.chosen_provider_id)
        auto_assigned = False
    else:
        # Auto-assign: pick best match without customer choosing
        matches = find_best_matches(
            service_type=req.service_type,
            location=req.location.model_dump(),
            date=req.date,
            time_slot=req.time_slot,
            urgency=req.urgency,
            providers=providers,
            problem_details=req.problem_details,
        )
        if not matches:
            raise HTTPException(
                status_code=404,
                detail="No available providers for this service, date and time",
            )
        provider = matches[0]["provider"]
        auto_assigned = True

    if not has_free_slot(provider.id, req.date, req.time_slot, provider.available_slots):
        # Slot taken — return next-best so the UI can recover gracefully
        alternatives = find_best_matches(
            service_type=req.service_type,
            location=req.location.model_dump(),
            date=req.date,
            time_slot=req.time_slot,
            urgency=req.urgency,
            providers=providers,
            exclude_provider_ids=[provider.id],
            problem_details=req.problem_details,
        )
        raise HTTPException(
            status_code=409,
            detail={
                "message": "This time slot was just booked by another customer",
                "alternatives": [
                    {
                        "provider_id": alt["provider"].id,
                        "provider_name": alt["provider"].name,
                        "match_score": alt["match_score"],
                        "estimated_price": alt["estimated_price"],
                        "eta_minutes": alt["eta_minutes"],
                    }
                    for alt in alternatives
                ],
            },
        )

    request_id = f"sr-{uuid.uuid4().hex[:8]}"
    try:
        book_slot(provider.id, req.date, req.time_slot, request_id)
    except SlotConflictError:
        raise HTTPException(
            status_code=409,
            detail="Slot was just booked by another request — please try again",
        )

    base_price = provider.price
    estimated_price = get_dynamic_price(base_price, req.urgency)

    customer_user_id = user.id if user else None

    service_request = ServiceRequest(
        id=request_id,
        customer_user_id=customer_user_id,
        customer_name=req.customer_name,
        customer_phone=req.customer_phone,
        service_type=req.service_type,
        location=req.location.model_dump(),
        date=req.date,
        time_slot=req.time_slot,
        urgency=req.urgency,
        problem_details=req.problem_details,
        image_url=req.image_url,
        provider_id=provider.id,
        rejected_provider_ids=[],
        auto_assigned=auto_assigned,
        status=STATUS_REQUESTED,
        base_price=base_price,
        estimated_price=estimated_price,
        created_at=datetime.utcnow(),
    )
    db.add(service_request)

    # Notify both sides
    notify(
        db, customer_user_id,
        "Booking placed",
        f"Your {req.service_type} request has been sent to {provider.name}.",
        "info", request_id,
    )
    notify_provider(
        db, provider.id,
        "New job request",
        f"{req.customer_name} needs {req.service_type} on {req.date} at {req.time_slot}.",
        "info", request_id,
    )

    db.commit()
    db.refresh(service_request)
    return request_out(db, service_request, viewer=user, provider=provider)


# --------------------------------------------------------------------------- #
# Read
# --------------------------------------------------------------------------- #

@router.get("/service-requests/{request_id}", response_model=ServiceRequestOut)
def get_service_request(
    request_id: str,
    db: Session = Depends(get_db),
    user: User | None = Depends(get_optional_user),
):
    """Single-request polling endpoint. Complexity: O(1) PK lookup."""
    return request_out(db, _req_or_404(db, request_id), viewer=user)


@router.get("/my/requests", response_model=list[ServiceRequestOut])
def my_requests(
    user: User = Depends(require_customer),
    db: Session = Depends(get_db),
):
    """All bookings for the logged-in customer, newest first. Complexity: O(r)."""
    reqs = (
        db.query(ServiceRequest)
        .filter(ServiceRequest.customer_user_id == user.id)
        .order_by(ServiceRequest.created_at.desc())
        .all()
    )
    return requests_out(db, reqs, viewer=user)


# --------------------------------------------------------------------------- #
# Status updates
# --------------------------------------------------------------------------- #

@router.patch("/service-requests/{request_id}/status", response_model=ServiceRequestOut)
def update_status(
    request_id: str,
    body: StatusUpdateRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """
    Advance or reject a job.

    Rejection path:
        1. Free the booked slot.
        2. Add the rejecting provider to `rejected_provider_ids`.
        3. Re-run matching, permanently excluding all prior rejecters.
        4. If a new provider is found: book their slot, reassign, reset to
           "Requested". If nobody is available: mark the request "Rejected".

    Complexity: O(1) for every transition except rejection, which adds O(n).
    """
    sr = _req_or_404(db, request_id)
    provider = _provider_or_404(db, sr.provider_id) if sr.provider_id else None

    try:
        transition(sr.status, body.new_status)
    except InvalidTransitionError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    if body.new_status == STATUS_REJECTED:
        # Release the slot
        if sr.provider_id:
            free_slot(sr.provider_id, sr.date, sr.time_slot)

        rejected_ids = list(sr.rejected_provider_ids or [])
        if sr.provider_id:
            rejected_ids.append(sr.provider_id)

        providers = db.query(Provider).all()
        matches = find_best_matches(
            service_type=sr.service_type,
            location=sr.location,
            date=sr.date,
            time_slot=sr.time_slot,
            urgency=sr.urgency,
            providers=providers,
            exclude_provider_ids=rejected_ids,
            problem_details=sr.problem_details,
        )

        if matches:
            new_provider = matches[0]["provider"]
            try:
                book_slot(new_provider.id, sr.date, sr.time_slot, sr.id)
            except SlotConflictError:
                raise HTTPException(
                    status_code=409,
                    detail="Could not reassign — the next provider's slot was just booked",
                )
            sr.provider_id = new_provider.id
            sr.base_price = new_provider.price
            sr.estimated_price = get_dynamic_price(new_provider.price, sr.urgency)
            sr.rejected_provider_ids = rejected_ids
            sr.status = STATUS_REQUESTED

            notify(
                db, sr.customer_user_id,
                *status_message("Rejected", sr.service_type, provider.name if provider else "Provider"),
                request_id,
            )
            notify_provider(
                db, new_provider.id,
                "New job request (reassigned)",
                f"{sr.customer_name} needs {sr.service_type} on {sr.date} at {sr.time_slot}.",
                "info", sr.id,
            )
        else:
            sr.rejected_provider_ids = rejected_ids
            sr.status = STATUS_REJECTED
            notify(
                db, sr.customer_user_id,
                "No providers available",
                f"All providers for {sr.service_type} at this time are unavailable. "
                "Please try a different date or time slot.",
                "error", request_id,
            )

    elif body.new_status == STATUS_CANCELLED:
        if sr.provider_id:
            free_slot(sr.provider_id, sr.date, sr.time_slot)
        sr.status = STATUS_CANCELLED
        notify_provider(
            db, sr.provider_id,
            "Job cancelled",
            f"{sr.customer_name} cancelled the {sr.service_type} request for {sr.date}.",
            "warning", sr.id,
        )

    else:
        sr.status = body.new_status
        # Stamp the timestamp field for this status if it exists
        ts_field = TIMESTAMP_FIELD.get(body.new_status)
        if ts_field:
            setattr(sr, ts_field, datetime.utcnow())

        # Auto-generate invoice and release payment on completion
        if body.new_status == STATUS_COMPLETED:
            sr.payment_status = "released"
            generate_invoice(db, sr)
        elif body.new_status == STATUS_WORK_DONE:
            sr.payment_status = "held"

        # Notify the customer
        if provider:
            title, body_text, kind = status_message(
                body.new_status, sr.service_type, provider.name
            )
            notify(db, sr.customer_user_id, title, body_text, kind, sr.id)

    db.commit()
    db.refresh(sr)
    return request_out(db, sr, viewer=user)


@router.post("/service-requests/{request_id}/release-payment", response_model=ServiceRequestOut)
def release_payment(
    request_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Customer confirms the work is satisfactory and releases escrow payment to the provider.
    Transitions status to 'Completed', marks payment_status='released', and issues invoice.
    """
    sr = _req_or_404(db, request_id)
    is_authorized = (
        (sr.customer_user_id and sr.customer_user_id == user.id)
        or (not sr.customer_user_id and user.role in (ROLE_CUSTOMER, ROLE_ADMIN))
        or (user.phone and user.phone == sr.customer_phone)
        or (user.role == ROLE_ADMIN)
    )
    if not is_authorized:
        raise HTTPException(status_code=403, detail="Not your booking")

    if not sr.customer_user_id and user.role == ROLE_CUSTOMER:
        sr.customer_user_id = user.id

    if sr.status not in (STATUS_WORK_DONE, STATUS_DISPUTED):
        raise HTTPException(
            status_code=400,
            detail=f"Cannot release payment when status is '{sr.status}'. Work must be completed first.",
        )

    sr.status = STATUS_COMPLETED
    sr.payment_status = "released"
    sr.completed_at = datetime.utcnow()
    generate_invoice(db, sr)

    provider = _provider_or_404(db, sr.provider_id) if sr.provider_id else None
    provider_name = provider.name if provider else "Provider"

    notify(
        db, sr.customer_user_id,
        "Payment released & job completed! 🎉",
        f"You released payment of ৳{sr.estimated_price} to {provider_name}. Your invoice is ready.",
        "success", sr.id,
    )
    if sr.provider_id:
        notify_provider(
            db, sr.provider_id,
            "Payment received! ৳",
            f"{sr.customer_name} released payment of ৳{sr.estimated_price} for your {sr.service_type} job.",
            "success", sr.id,
        )

    db.commit()
    db.refresh(sr)
    return request_out(db, sr, viewer=user)


@router.post("/service-requests/{request_id}/dispute", response_model=ServiceRequestOut)
def dispute_request(
    request_id: str,
    body: DisputeCreateRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Customer files a dispute/report against a job that was not done properly.
    Transitions status to 'Disputed', saves problem note and proof photo.
    Payment remains held in escrow pending admin review.
    """
    sr = _req_or_404(db, request_id)
    is_authorized = (
        (sr.customer_user_id and sr.customer_user_id == user.id)
        or (not sr.customer_user_id and user.role in (ROLE_CUSTOMER, ROLE_ADMIN))
        or (user.phone and user.phone == sr.customer_phone)
        or (user.role == ROLE_ADMIN)
    )
    if not is_authorized:
        raise HTTPException(status_code=403, detail="Not your booking")

    if not sr.customer_user_id and user.role == ROLE_CUSTOMER:
        sr.customer_user_id = user.id

    if sr.status not in (STATUS_WORK_DONE, "In Progress"):
        raise HTTPException(
            status_code=400,
            detail=f"Cannot dispute a booking with status '{sr.status}'.",
        )

    sr.status = STATUS_DISPUTED
    sr.dispute_note = body.note
    sr.dispute_image_url = body.image_url
    sr.dispute_created_at = datetime.utcnow()
    sr.payment_status = "held"

    provider = _provider_or_404(db, sr.provider_id) if sr.provider_id else None
    provider_name = provider.name if provider else "Provider"

    notify(
        db, sr.customer_user_id,
        "Dispute report submitted 🛡️",
        f"Your report for {sr.service_type} was received. Our admin team will inspect the proof photo and arbitrate.",
        "warning", sr.id,
    )
    if sr.provider_id:
        notify_provider(
            db, sr.provider_id,
            "Job disputed by customer ⚠️",
            f"{sr.customer_name} reported an issue with your {sr.service_type} job. Payment is held while admin reviews.",
            "warning", sr.id,
        )

    # Notify administrators
    admins = db.query(User).filter(User.role == "admin").all()
    for adm in admins:
        notify(
            db, adm.id,
            "New Customer Dispute Filed",
            f"Customer {sr.customer_name} disputed booking #{sr.id} ({sr.service_type}) against {provider_name}.",
            "warning", sr.id,
        )

    db.commit()
    db.refresh(sr)
    return request_out(db, sr, viewer=user)


@router.post("/service-requests/{request_id}/cancel", response_model=ServiceRequestOut)
def cancel_request(
    request_id: str,
    user: User = Depends(require_customer),
    db: Session = Depends(get_db),
):
    """Customer cancels their own booking. Delegates to the status machine."""
    sr = _req_or_404(db, request_id)
    if sr.customer_user_id != user.id:
        raise HTTPException(status_code=403, detail="Not your booking")

    body = StatusUpdateRequest(new_status=STATUS_CANCELLED)
    return update_status(request_id, body, db=db, user=user)


# --------------------------------------------------------------------------- #
# Rating
# --------------------------------------------------------------------------- #

@router.post("/service-requests/{request_id}/rate", response_model=ServiceRequestOut)
def rate_service(
    request_id: str,
    body: RatingRequest,
    user: User = Depends(require_customer),
    db: Session = Depends(get_db),
):
    """
    Submit a 1–5 star rating and optional feedback for a completed job.
    Updates the provider's running average in place. Idempotent — submitting a
    second rating overwrites the first (same customer, same job).

    Running average: new_avg = (old_avg * n + new_rating) / (n + 1)
    Complexity: O(1).
    """
    sr = _req_or_404(db, request_id)

    if sr.customer_user_id != user.id:
        raise HTTPException(status_code=403, detail="Not your booking")

    if sr.status != STATUS_COMPLETED:
        raise HTTPException(
            status_code=400, detail="You can only rate a completed service"
        )

    provider = _provider_or_404(db, sr.provider_id)

    if sr.rating is not None:
        # Overwrite — remove the old contribution first
        old_avg = provider.rating or 0
        old_count = provider.rating_count or 0
        if old_count > 1:
            provider.rating = (old_avg * old_count - sr.rating) / (old_count - 1)
            provider.rating_count = old_count - 1
        else:
            provider.rating = 0.0
            provider.rating_count = 0

    old_avg = provider.rating or 0
    old_count = provider.rating_count or 0
    provider.rating = round((old_avg * old_count + body.rating) / (old_count + 1), 2)
    provider.rating_count = old_count + 1

    sr.rating = body.rating
    sr.feedback = body.feedback or None

    db.commit()
    db.refresh(sr)
    return request_out(db, sr, viewer=user, provider=provider)


# --------------------------------------------------------------------------- #
# Invoice
# --------------------------------------------------------------------------- #

@router.get("/service-requests/{request_id}/invoice", response_model=InvoiceOut)
def get_invoice(
    request_id: str,
    db: Session = Depends(get_db),
    _user: User | None = Depends(get_optional_user),
):
    """Fetch the auto-generated invoice for a completed request."""
    sr = _req_or_404(db, request_id)
    from models import Invoice
    invoice = db.query(Invoice).filter(Invoice.request_id == sr.id).first()
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not yet generated")
    return InvoiceOut.model_validate(invoice)


# --------------------------------------------------------------------------- #
# Notifications
# --------------------------------------------------------------------------- #

@router.get("/notifications", response_model=list[NotificationOut])
def get_notifications(
    limit: int = 30,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Last `limit` notifications for the logged-in user, newest first."""
    return (
        db.query(Notification)
        .filter(Notification.user_id == user.id)
        .order_by(Notification.created_at.desc())
        .limit(limit)
        .all()
    )


@router.post("/notifications/mark-read", response_model=MessageOut)
def mark_notifications_read(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Mark every unread notification as read. Complexity: O(unread)."""
    db.query(Notification).filter(
        Notification.user_id == user.id, Notification.read.is_(False)
    ).update({"read": True})
    db.commit()
    return MessageOut(message="All notifications marked as read")


# --------------------------------------------------------------------------- #
# Legacy convenience endpoints kept for test compatibility
# --------------------------------------------------------------------------- #

@router.get("/service-requests", response_model=list[ServiceRequestOut])
def list_all_requests(
    db: Session = Depends(get_db),
    user: User | None = Depends(get_optional_user),
):
    """All requests (demo / debug). Not shown in the UI."""
    reqs = (
        db.query(ServiceRequest)
        .order_by(ServiceRequest.created_at.desc())
        .limit(100)
        .all()
    )
    return requests_out(db, reqs, viewer=user)


@router.get("/providers/{provider_id}/requests", response_model=list[ServiceRequestOut])
def get_provider_requests(
    provider_id: str,
    db: Session = Depends(get_db),
    user: User | None = Depends(get_optional_user),
):
    """Provider's assigned jobs. Kept for backward compatibility with old tests."""
    reqs = (
        db.query(ServiceRequest)
        .filter(ServiceRequest.provider_id == provider_id)
        .order_by(ServiceRequest.created_at.desc())
        .all()
    )
    return requests_out(db, reqs, viewer=user)
