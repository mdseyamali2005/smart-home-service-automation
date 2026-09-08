"""
Serializers — ORM rows → Pydantic response models.

Kept in one module so the customer view, the provider dashboard and the
tracking screen can never drift into showing different shapes for the same
service request.
"""

from sqlalchemy.orm import Session

from matching import estimate_eta_minutes, haversine_km
from models import Invoice, Provider, ServiceRequest, User
from schemas import InvoiceOut, ProviderOut, ServiceRequestOut
from state_machine import next_statuses


def provider_out(provider: Provider) -> ProviderOut:
    """Complexity: O(s) over the provider's declared slots."""
    return ProviderOut(
        id=provider.id,
        name=provider.name,
        service_type=provider.service_type,
        location=provider.location,
        rating=round(provider.rating or 0, 2),
        rating_count=provider.rating_count or 0,
        price=provider.price,
        expertise_tags=provider.expertise_tags or [],
        available_slots=provider.available_slots or [],
        bio=provider.bio or "",
        status=provider.status or "approved",
    )


def request_out(
    db: Session,
    request: ServiceRequest,
    viewer: User | None = None,
    provider: Provider | None = None,
) -> ServiceRequestOut:
    """
    Build the full response for one service request.

    `viewer` decides which status buttons are offered — a customer never sees
    "Mark complete", a provider never sees "Cancel". `provider` lets callers
    that already loaded the row skip a repeat query.

    Complexity: O(1) plus at most two indexed lookups.
    """
    result = ServiceRequestOut.model_validate(request)

    if provider is None and request.provider_id:
        provider = db.query(Provider).filter(Provider.id == request.provider_id).first()

    if provider:
        result.provider = provider_out(provider)
        distance = haversine_km(provider.location, request.location)
        result.distance_km = round(distance, 2)
        result.eta_minutes = estimate_eta_minutes(distance, request.urgency)

    invoice = db.query(Invoice).filter(Invoice.request_id == request.id).first()
    if invoice:
        result.invoice = InvoiceOut.model_validate(invoice)

    result.next_statuses = next_statuses(
        request.status, actor=viewer.role if viewer else None
    )
    return result


def requests_out(
    db: Session, requests: list[ServiceRequest], viewer: User | None = None
) -> list[ServiceRequestOut]:
    """
    Serialize a list, loading every referenced provider in one query instead of
    one per row.

    Complexity: O(r) after a single O(p) provider fetch.
    """
    provider_ids = {r.provider_id for r in requests if r.provider_id}
    providers = (
        {
            p.id: p
            for p in db.query(Provider).filter(Provider.id.in_(provider_ids)).all()
        }
        if provider_ids
        else {}
    )
    return [
        request_out(db, request, viewer, providers.get(request.provider_id))
        for request in requests
    ]
