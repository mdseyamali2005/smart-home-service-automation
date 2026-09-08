"""
Pydantic schemas — the request/response contract for every endpoint.

Grouped by area: shared → auth → provider → matching → service request →
notifications → invoices.
"""

import re
from datetime import datetime, timezone
from typing import Annotated, Literal, Optional

from pydantic import AfterValidator, BaseModel, Field, PlainSerializer, field_validator

def serialize_utc_datetime(dt: Optional[datetime]) -> Optional[str]:
    if dt is None:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.isoformat().replace("+00:00", "Z")

UtcDateTime = Annotated[datetime, PlainSerializer(serialize_utc_datetime, return_type=str, when_used="json-unless-none")]

Urgency = Literal["Normal", "Urgent", "Emergency"]

_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[A-Za-z]{2,}$")


def _valid_email(value: str) -> str:
    """
    Validate and normalise an email address.

    Deliberately a small regex rather than pydantic's `EmailStr`: that pulls in
    the `email-validator` package, and the demo machine should need nothing
    beyond FastAPI, Uvicorn, SQLAlchemy and Pydantic.
    """
    cleaned = value.strip().lower()
    if not _EMAIL_RE.match(cleaned):
        raise ValueError("Enter a valid email address")
    return cleaned


Email = Annotated[str, AfterValidator(_valid_email)]

# Images arrive as base64 data URLs (no multipart dependency). The client
# downscales before upload; this is the server-side backstop at ~2 MB.
MAX_IMAGE_CHARS = 2_800_000


# --------------------------------------------------------------------------- #
# Shared
# --------------------------------------------------------------------------- #

class Location(BaseModel):
    address: str = Field(min_length=2, max_length=160)
    lat: float = Field(ge=-90, le=90)
    lng: float = Field(ge=-180, le=180)


class SlotSchema(BaseModel):
    date: str
    time_slot: str


class MessageOut(BaseModel):
    message: str


# --------------------------------------------------------------------------- #
# Auth
# --------------------------------------------------------------------------- #

class CustomerSignup(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    email: Email
    phone: str = Field(min_length=6, max_length=20)
    password: str = Field(min_length=6, max_length=128)
    default_location: Location


class ProviderSignup(BaseModel):
    name: str = Field(min_length=2, max_length=80)  # contact person
    business_name: str = Field(min_length=2, max_length=100)
    email: Email
    phone: str = Field(min_length=6, max_length=20)
    password: str = Field(min_length=6, max_length=128)
    service_type: str
    location: Location
    price: int = Field(ge=100, le=100_000)
    expertise_tags: list[str] = []
    bio: str = ""

    @field_validator("expertise_tags")
    @classmethod
    def normalise_tags(cls, tags: list[str]) -> list[str]:
        """Lower-case, underscore-joined, de-duplicated, max 10 tags."""
        seen, cleaned = set(), []
        for tag in tags:
            slug = tag.strip().lower().replace(" ", "_")
            if slug and slug not in seen:
                seen.add(slug)
                cleaned.append(slug)
        return cleaned[:10]


class LoginRequest(BaseModel):
    email: Email
    password: str


class UserOut(BaseModel):
    id: str
    role: str
    name: str
    email: str
    phone: str
    is_banned: bool = False

    class Config:
        from_attributes = True


class CustomerOut(BaseModel):
    id: str
    name: str
    phone: str
    default_location: dict

    class Config:
        from_attributes = True


class ProviderOut(BaseModel):
    id: str
    name: str
    service_type: str
    location: Location
    rating: float
    rating_count: int
    price: int
    expertise_tags: list[str]
    available_slots: list[SlotSchema]
    bio: str = ""
    status: str = "approved"

    class Config:
        from_attributes = True


class AuthResponse(BaseModel):
    token: str
    user: UserOut
    customer: Optional[CustomerOut] = None
    provider: Optional[ProviderOut] = None


class SessionOut(BaseModel):
    """`GET /api/auth/me` — everything the frontend needs to boot a session."""

    user: UserOut
    customer: Optional[CustomerOut] = None
    provider: Optional[ProviderOut] = None
    unread_notifications: int = 0


# --------------------------------------------------------------------------- #
# Provider self-service
# --------------------------------------------------------------------------- #

class ProviderProfileUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=2, max_length=100)
    price: Optional[int] = Field(default=None, ge=100, le=100_000)
    location: Optional[Location] = None
    expertise_tags: Optional[list[str]] = None
    bio: Optional[str] = Field(default=None, max_length=400)


class SlotUpdate(BaseModel):
    date: str
    time_slot: str


class ProviderStatsOut(BaseModel):
    total_jobs: int
    pending: int
    active: int
    completed: int
    cancelled: int
    total_earnings: int
    average_rating: float
    rating_count: int
    completion_rate: float
    earnings_by_day: list[dict]


# --------------------------------------------------------------------------- #
# Availability
# --------------------------------------------------------------------------- #

class DayAvailability(BaseModel):
    date: str
    slots: list[dict]


class AvailabilityOut(BaseModel):
    service_type: str
    days: list[DayAvailability]


# --------------------------------------------------------------------------- #
# Matching
# --------------------------------------------------------------------------- #

class MatchPreviewRequest(BaseModel):
    service_type: str
    location: Location
    date: str
    time_slot: str
    urgency: Urgency = "Normal"
    problem_details: str = ""


class MatchCandidate(BaseModel):
    provider: ProviderOut
    match_score: float
    base_price: int
    estimated_price: int
    distance_km: float
    eta_minutes: int
    open_jobs: int
    breakdown: dict
    weights: dict
    tags: list[str] = []


class MatchPreviewResponse(BaseModel):
    candidates: list[MatchCandidate]
    suggested_urgency: Optional[str] = None
    total_considered: int = 0


# --------------------------------------------------------------------------- #
# Service requests
# --------------------------------------------------------------------------- #

class ServiceRequestCreate(BaseModel):
    service_type: str
    location: Location
    date: str
    time_slot: str
    urgency: Urgency = "Normal"
    problem_details: str = ""
    image_url: Optional[str] = None
    # Omit to let the server pick the best match automatically.
    chosen_provider_id: Optional[str] = None
    customer_name: str = Field(min_length=2, max_length=80)
    customer_phone: str = Field(min_length=6, max_length=20)

    @field_validator("image_url")
    @classmethod
    def check_image_size(cls, value: Optional[str]) -> Optional[str]:
        """Reject an oversized attachment before it reaches the database."""
        if value and len(value) > MAX_IMAGE_CHARS:
            raise ValueError("Image is too large — please use one under 2 MB")
        return value or None


class InvoiceOut(BaseModel):
    invoice_no: str
    base_amount: int
    urgency_surcharge: int
    service_fee: int
    vat: int
    total: int
    issued_at: UtcDateTime

    class Config:
        from_attributes = True


class ServiceRequestOut(BaseModel):
    id: str
    customer_name: str
    customer_phone: str
    service_type: str
    location: dict
    date: str
    time_slot: str
    urgency: str
    problem_details: str
    image_url: Optional[str]
    provider_id: Optional[str]
    status: str
    estimated_price: int
    base_price: int
    auto_assigned: bool = False
    created_at: UtcDateTime
    accepted_at: Optional[UtcDateTime] = None
    on_the_way_at: Optional[UtcDateTime] = None
    in_progress_at: Optional[UtcDateTime] = None
    work_done_at: Optional[UtcDateTime] = None
    completed_at: Optional[UtcDateTime] = None
    payment_status: Optional[str] = "held"
    dispute_note: Optional[str] = None
    dispute_image_url: Optional[str] = None
    dispute_created_at: Optional[UtcDateTime] = None
    dispute_resolution: Optional[str] = None
    dispute_resolved_at: Optional[UtcDateTime] = None
    dispute_admin_note: Optional[str] = None
    rating: Optional[float] = None
    feedback: Optional[str] = None
    provider: Optional[ProviderOut] = None
    invoice: Optional[InvoiceOut] = None
    next_statuses: list[str] = []
    eta_minutes: Optional[int] = None
    distance_km: Optional[float] = None

    class Config:
        from_attributes = True


class StatusUpdateRequest(BaseModel):
    new_status: str


class DisputeCreateRequest(BaseModel):
    note: str = Field(default="Customer reported issue with service completion", min_length=1, max_length=2000)
    image_url: Optional[str] = None


class DisputeResolveRequest(BaseModel):
    action: str  # "release" | "refund"
    admin_note: Optional[str] = Field(default="", max_length=500)


class RatingRequest(BaseModel):
    rating: float = Field(ge=1, le=5)
    feedback: str = Field(default="", max_length=500)


# --------------------------------------------------------------------------- #
# Notifications
# --------------------------------------------------------------------------- #

class NotificationOut(BaseModel):
    id: str
    title: str
    body: str
    kind: str
    request_id: Optional[str]
    read: bool
    created_at: UtcDateTime

    class Config:
        from_attributes = True


# --------------------------------------------------------------------------- #
# Admin
# --------------------------------------------------------------------------- #

class AdminStatsOut(BaseModel):
    total_users: int
    total_customers: int
    total_providers: int
    total_admins: int
    total_requests: int
    completed_requests: int
    active_requests: int
    disputed_requests: int = 0
    pending_providers: int
    banned_users: int
    total_income: int
    income_by_day: list[dict]


class UserListOut(BaseModel):
    id: str
    role: str
    name: str
    email: str
    phone: str
    is_banned: bool = False
    created_at: Optional[UtcDateTime] = None
    provider_status: Optional[str] = None
    provider_service_type: Optional[str] = None

    class Config:
        from_attributes = True


class ProviderApprovalOut(BaseModel):
    provider_id: str
    user_id: str
    business_name: str
    email: str
    phone: str
    service_type: str
    location: dict
    price: int
    status: str
    created_at: Optional[UtcDateTime] = None

    class Config:
        from_attributes = True
