"""
Invoicing — an invoice is generated automatically the moment a job is marked
Completed, with no action from either side.

Breakdown
---------
    base amount        the provider's declared charge for the category
    urgency surcharge  the dynamic-pricing delta (Urgent 15%, Emergency 30%)
    platform fee       5% of the base, capped at ৳150
    VAT                5% of (base + surcharge + fee), rounded

Amounts are frozen at issue time, so a later price or rating change never
rewrites history. Complexity: O(1).
"""

from datetime import datetime

from sqlalchemy.orm import Session

from auth import new_id
from models import Invoice

PLATFORM_FEE_RATE = 0.05
PLATFORM_FEE_CAP = 150
VAT_RATE = 0.05


def build_breakdown(base_price: int, final_price: int) -> dict:
    """
    Turn the two stored prices into a line-item breakdown.

    Complexity: O(1).
    """
    base = max(0, int(base_price or final_price or 0))
    surcharge = max(0, int(final_price or 0) - base)
    fee = min(PLATFORM_FEE_CAP, int(round(base * PLATFORM_FEE_RATE)))
    subtotal = base + surcharge + fee
    vat = int(round(subtotal * VAT_RATE))

    return {
        "base_amount": base,
        "urgency_surcharge": surcharge,
        "service_fee": fee,
        "vat": vat,
        "total": subtotal + vat,
    }


def generate_invoice(db: Session, service_request) -> Invoice:
    """
    Create the invoice for a completed request, or return the existing one so
    repeated calls stay idempotent.

    The caller owns the transaction. Complexity: O(1).
    """
    existing = (
        db.query(Invoice).filter(Invoice.request_id == service_request.id).first()
    )
    if existing:
        return existing

    amounts = build_breakdown(service_request.base_price, service_request.estimated_price)
    issued = datetime.utcnow()

    invoice = Invoice(
        id=new_id("inv"),
        request_id=service_request.id,
        invoice_no=f"HS-{issued.strftime('%Y%m')}-{service_request.id.split('-')[-1].upper()}",
        issued_at=issued,
        **amounts,
    )
    db.add(invoice)
    return invoice
