"""
Notifications — a persisted, per-user event feed that stands in for SMS/push.

The challenge allows simulated notifications. Rather than fire a toast that
vanishes on refresh, every event is written to the `notifications` table and
addressed to a specific user, so both sides of a booking keep a real history
and the navbar can show an unread count.

Complexity: one insert per event, O(1).
"""

from sqlalchemy.orm import Session

from auth import new_id
from models import Notification, Provider, User


def notify(
    db: Session,
    user_id: str | None,
    title: str,
    body: str = "",
    kind: str = "info",
    request_id: str | None = None,
) -> Notification | None:
    """
    Queue one notification. No-ops when `user_id` is None (a guest booking),
    which keeps every call site free of null checks.

    The caller owns the transaction — this only adds to the session.
    """
    if not user_id:
        return None

    notification = Notification(
        id=new_id("n"),
        user_id=user_id,
        title=title,
        body=body,
        kind=kind,
        request_id=request_id,
    )
    db.add(notification)
    return notification


def notify_provider(
    db: Session,
    provider_id: str | None,
    title: str,
    body: str = "",
    kind: str = "info",
    request_id: str | None = None,
) -> Notification | None:
    """Send to whichever user account owns `provider_id`, if any."""
    if not provider_id:
        return None
    provider = db.query(Provider).filter(Provider.id == provider_id).first()
    if not provider or not provider.user_id:
        return None
    return notify(db, provider.user_id, title, body, kind, request_id)


def unread_count(db: Session, user: User) -> int:
    """Complexity: O(1) with the index on notifications.user_id."""
    return (
        db.query(Notification)
        .filter(Notification.user_id == user.id, Notification.read.is_(False))
        .count()
    )


# --------------------------------------------------------------------------- #
# Message templates — one place to keep the wording consistent
# --------------------------------------------------------------------------- #

def status_message(status: str, service_type: str, provider_name: str) -> tuple[str, str, str]:
    """
    Return (title, body, kind) for a status change, phrased for the customer.

    Complexity: O(1).
    """
    templates = {
        "Accepted": (
            "Booking confirmed",
            f"{provider_name} accepted your {service_type} request and is scheduled to arrive.",
            "success",
        ),
        "On the Way": (
            "Your technician is on the way",
            f"{provider_name} has left for your address. Track the arrival live.",
            "info",
        ),
        "In Progress": (
            "Work started",
            f"{provider_name} has started your {service_type} job.",
            "info",
        ),
        "Work Done": (
            "Work finished by provider",
            f"{provider_name} marked your {service_type} work as done. Please verify and release payment.",
            "warning",
        ),
        "Completed": (
            "Service completed & payment released",
            f"Payment for {service_type} has been released to {provider_name}. Your invoice is ready.",
            "success",
        ),
        "Disputed": (
            "Dispute filed",
            f"You reported an issue for {service_type}. Our support team is reviewing your report.",
            "warning",
        ),
        "Refunded": (
            "Booking refunded",
            f"Your {service_type} booking dispute was resolved and funds have been refunded.",
            "info",
        ),
        "Rejected": (
            "Reassigning your request",
            f"{provider_name} could not take the job, so we are matching you with the next best provider.",
            "warning",
        ),
        "Cancelled": (
            "Booking cancelled",
            f"Your {service_type} request has been cancelled and the slot released.",
            "warning",
        ),
    }
    return templates.get(
        status,
        ("Request updated", f"Your {service_type} request is now “{status}”.", "info"),
    )
