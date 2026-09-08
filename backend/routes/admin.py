"""
Admin routes — platform management, income tracking, user management,
and provider approval.

Admin-only (token required, admin role)
    GET   /api/admin/stats               — platform overview
    GET   /api/admin/users               — paginated user list
    PATCH /api/admin/users/{user_id}/ban  — toggle ban
    GET   /api/admin/providers/pending    — pending provider applications
    PATCH /api/admin/providers/{provider_id}/approve — approve provider
    PATCH /api/admin/providers/{provider_id}/reject  — reject provider
"""

from collections import defaultdict
from datetime import date, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from auth import require_admin
from invoicing import generate_invoice
from models import (
    ROLE_ADMIN,
    ROLE_CUSTOMER,
    ROLE_PROVIDER,
    Invoice,
    Provider,
    ServiceRequest,
    User,
    get_db,
)
from notifications import notify
from schemas import (
    AdminStatsOut,
    DisputeResolveRequest,
    MessageOut,
    ProviderApprovalOut,
    ServiceRequestOut,
    UserListOut,
)
from scheduling import free_slot
from serializers import request_out, requests_out
from state_machine import (
    ACTIVE_STATUSES,
    STATUS_COMPLETED,
    STATUS_DISPUTED,
    STATUS_REFUNDED,
)

router = APIRouter(prefix="/api/admin", tags=["admin"])


@router.get("/stats", response_model=AdminStatsOut)
def admin_stats(
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Platform-wide statistics and income summary."""
    users = db.query(User).all()
    providers = db.query(Provider).all()
    requests = db.query(ServiceRequest).all()
    invoices = db.query(Invoice).all()

    total_income = sum(inv.total or 0 for inv in invoices)

    # Income for each of the last 7 days
    today = date.today()
    window = [(today - timedelta(days=offset)).isoformat() for offset in range(6, -1, -1)]
    earned_on: dict[str, int] = {day: 0 for day in window}
    for inv in invoices:
        day = (inv.issued_at or datetime.utcnow()).date().isoformat()
        if day in earned_on:
            earned_on[day] += inv.total or 0

    return AdminStatsOut(
        total_users=len(users),
        total_customers=sum(1 for u in users if u.role == ROLE_CUSTOMER),
        total_providers=sum(1 for u in users if u.role == ROLE_PROVIDER),
        total_admins=sum(1 for u in users if u.role == ROLE_ADMIN),
        total_requests=len(requests),
        completed_requests=sum(1 for r in requests if r.status == STATUS_COMPLETED),
        active_requests=sum(1 for r in requests if r.status in ACTIVE_STATUSES),
        disputed_requests=sum(1 for r in requests if r.status == STATUS_DISPUTED),
        pending_providers=sum(1 for p in providers if p.status == "pending"),
        banned_users=sum(1 for u in users if u.is_banned),
        total_income=total_income,
        income_by_day=[{"date": day, "amount": earned_on[day]} for day in window],
    )


@router.get("/users", response_model=list[UserListOut])
def admin_users(
    role: str | None = Query(default=None),
    search: str | None = Query(default=None),
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """List all users with optional role filter and search."""
    query = db.query(User)

    if role:
        query = query.filter(User.role == role)
    if search:
        pattern = f"%{search}%"
        query = query.filter(
            (User.name.ilike(pattern)) | (User.email.ilike(pattern))
        )

    users = query.order_by(User.created_at.desc()).limit(100).all()

    # Batch-load provider info
    provider_map = {}
    provider_user_ids = [u.id for u in users if u.role == ROLE_PROVIDER]
    if provider_user_ids:
        providers = db.query(Provider).filter(Provider.user_id.in_(provider_user_ids)).all()
        provider_map = {p.user_id: p for p in providers}

    result = []
    for u in users:
        item = UserListOut(
            id=u.id,
            role=u.role,
            name=u.name,
            email=u.email,
            phone=u.phone,
            is_banned=u.is_banned or False,
            created_at=u.created_at,
        )
        prov = provider_map.get(u.id)
        if prov:
            item.provider_status = prov.status
            item.provider_service_type = prov.service_type
        result.append(item)

    return result


@router.patch("/users/{user_id}/ban", response_model=MessageOut)
def toggle_ban(
    user_id: str,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Toggle ban status for a user. Cannot ban admins."""
    target = db.query(User).filter(User.id == user_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    if target.role == ROLE_ADMIN:
        raise HTTPException(status_code=400, detail="Cannot ban an admin account")
    if target.id == admin.id:
        raise HTTPException(status_code=400, detail="Cannot ban yourself")

    target.is_banned = not target.is_banned
    action = "banned" if target.is_banned else "unbanned"

    notify(
        db, target.id,
        f"Account {action}",
        f"Your account has been {action} by an administrator."
        + (" Contact support if you believe this is an error." if target.is_banned else ""),
        "error" if target.is_banned else "success",
    )
    db.commit()
    return MessageOut(message=f"User {target.name} has been {action}")


@router.get("/providers/pending", response_model=list[ProviderApprovalOut])
def pending_providers(
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """List all providers awaiting approval."""
    providers = (
        db.query(Provider)
        .filter(Provider.status == "pending")
        .all()
    )

    result = []
    for p in providers:
        user = db.query(User).filter(User.id == p.user_id).first()
        result.append(ProviderApprovalOut(
            provider_id=p.id,
            user_id=p.user_id or "",
            business_name=p.name,
            email=user.email if user else "",
            phone=user.phone if user else "",
            service_type=p.service_type,
            location=p.location or {},
            price=p.price,
            status=p.status or "pending",
            created_at=user.created_at if user else None,
        ))
    return result


@router.patch("/providers/{provider_id}/approve", response_model=MessageOut)
def approve_provider(
    provider_id: str,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Approve a pending provider application."""
    provider = db.query(Provider).filter(Provider.id == provider_id).first()
    if not provider:
        raise HTTPException(status_code=404, detail="Provider not found")
    if provider.status == "approved":
        return MessageOut(message="Provider is already approved")

    provider.status = "approved"
    notify(
        db, provider.user_id,
        "Application approved! 🎉",
        f"Your provider account for {provider.service_type} has been approved. "
        "You can now receive job requests and manage your availability.",
        "success",
    )
    db.commit()
    return MessageOut(message=f"Provider {provider.name} has been approved")


@router.patch("/providers/{provider_id}/reject", response_model=MessageOut)
def reject_provider(
    provider_id: str,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Reject a pending provider application."""
    provider = db.query(Provider).filter(Provider.id == provider_id).first()
    if not provider:
        raise HTTPException(status_code=404, detail="Provider not found")

    provider.status = "rejected"
    notify(
        db, provider.user_id,
        "Application not approved",
        "Your provider application was not approved at this time. "
        "Please contact support for more details.",
        "error",
    )
    db.commit()
    return MessageOut(message=f"Provider {provider.name} has been rejected")


@router.get("/disputes", response_model=list[ServiceRequestOut])
def list_disputes(
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """List all requests that are currently Disputed or have had disputes."""
    disputes = (
        db.query(ServiceRequest)
        .filter((ServiceRequest.status == STATUS_DISPUTED) | (ServiceRequest.dispute_note.isnot(None)))
        .order_by(ServiceRequest.created_at.desc())
        .all()
    )
    return requests_out(db, disputes, viewer=admin)


@router.patch("/disputes/{request_id}/resolve", response_model=ServiceRequestOut)
def resolve_dispute(
    request_id: str,
    body: DisputeResolveRequest,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """
    Arbitrate a customer dispute.
    Action 'release': Rule in provider's favor, release escrow payout, status -> Completed.
    Action 'refund': Rule in customer's favor, refund escrow funds, status -> Refunded.
    """
    sr = db.query(ServiceRequest).filter(ServiceRequest.id == request_id).first()
    if not sr:
        raise HTTPException(status_code=404, detail="Service request not found")

    if sr.status != STATUS_DISPUTED:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot resolve request with status '{sr.status}'. Must be 'Disputed'.",
        )

    provider = db.query(Provider).filter(Provider.id == sr.provider_id).first() if sr.provider_id else None
    provider_name = provider.name if provider else "Provider"

    if body.action == "release":
        sr.status = STATUS_COMPLETED
        sr.payment_status = "released"
        sr.dispute_resolution = "paid_provider"
        sr.dispute_resolved_at = datetime.utcnow()
        sr.dispute_admin_note = body.admin_note
        sr.completed_at = datetime.utcnow()
        generate_invoice(db, sr)

        notify(
            db, sr.customer_user_id,
            "Dispute Resolved: Provider Paid",
            f"Admin reviewed your dispute for {sr.service_type}. Decision: Payment released to provider. Note: {body.admin_note or 'Work deemed completed.'}",
            "info", sr.id,
        )
        if sr.provider_id:
            notify(
                db, provider.user_id if provider else None,
                "Dispute Won: Payment Released! ৳",
                f"Admin reviewed the customer report for {sr.service_type} and approved your payout of ৳{sr.estimated_price}. Note: {body.admin_note or 'Approved.'}",
                "success", sr.id,
            )

    elif body.action == "refund":
        sr.status = STATUS_REFUNDED
        sr.payment_status = "refunded"
        sr.dispute_resolution = "refunded_customer"
        sr.dispute_resolved_at = datetime.utcnow()
        sr.dispute_admin_note = body.admin_note
        if sr.provider_id:
            free_slot(sr.provider_id, sr.date, sr.time_slot)

        notify(
            db, sr.customer_user_id,
            "Dispute Won: Refund Approved! 🎉",
            f"Admin approved your report for {sr.service_type}. ৳{sr.estimated_price} has been refunded to your account. Note: {body.admin_note or 'Refund issued.'}",
            "success", sr.id,
        )
        if sr.provider_id:
            notify(
                db, provider.user_id if provider else None,
                "Dispute Resolved: Refund to Customer",
                f"Admin reviewed the customer report for {sr.service_type} and issued a refund to the customer. Payout denied. Note: {body.admin_note or 'Claim rejected.'}",
                "error", sr.id,
            )
    else:
        raise HTTPException(status_code=400, detail="Invalid action. Must be 'release' or 'refund'.")

    db.commit()
    db.refresh(sr)
    return request_out(db, sr, viewer=admin)
