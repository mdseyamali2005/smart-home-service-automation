"""
SQLAlchemy models for Smart Home Service Automation.

Tables
------
User            — one row per account. `role` decides which profile table applies.
Customer        — customer profile (1:1 with a User of role "customer").
Provider        — provider profile (1:1 with a User of role "provider").
ServiceRequest  — a booking, including its status timeline and rating.
Notification    — persisted, per-user notification feed (simulated SMS).
Invoice         — auto-generated once a request reaches "Completed".

The engine URL comes from the DATABASE_URL env var and defaults to a local
SQLite file, so switching to hosted Postgres later is a one-line config change
and needs no code edits.
"""

import os
from datetime import datetime

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    JSON,
    String,
    create_engine,
)
from sqlalchemy.orm import declarative_base, sessionmaker

Base = declarative_base()

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./smart_home.db")

# check_same_thread is a SQLite-only argument; skip it for any other backend.
_connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}
engine = create_engine(DATABASE_URL, connect_args=_connect_args)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


ROLE_CUSTOMER = "customer"
ROLE_PROVIDER = "provider"
ROLE_ADMIN = "admin"


class User(Base):
    """An account. Customers and providers are the same table, split by `role`."""

    __tablename__ = "users"

    id = Column(String, primary_key=True)
    role = Column(String, nullable=False)  # customer | provider | admin
    name = Column(String, nullable=False)
    email = Column(String, nullable=False, unique=True, index=True)
    phone = Column(String, nullable=False)
    password_hash = Column(String, nullable=False)
    is_banned = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)


class Customer(Base):
    """Customer profile — saved address so repeat bookings need no retyping."""

    __tablename__ = "customers"

    id = Column(String, primary_key=True)
    user_id = Column(String, ForeignKey("users.id"), nullable=True, index=True)
    name = Column(String, nullable=False)
    phone = Column(String, nullable=False)
    default_location = Column(JSON, nullable=False)  # {address, lat, lng}


class Provider(Base):
    """Provider profile — what the matching algorithm scores against."""

    __tablename__ = "providers"

    id = Column(String, primary_key=True)
    user_id = Column(String, ForeignKey("users.id"), nullable=True, index=True)
    name = Column(String, nullable=False)
    service_type = Column(String, nullable=False, index=True)
    location = Column(JSON, nullable=False)  # {address, lat, lng}
    rating = Column(Float, default=0.0)
    rating_count = Column(Integer, default=0)  # denominator of the running average
    price = Column(Integer, nullable=False)  # base charge in BDT
    expertise_tags = Column(JSON, default=list)  # ["ac_repair", ...]
    available_slots = Column(JSON, default=list)  # [{date, time_slot}, ...]
    bio = Column(String, default="")
    status = Column(String, default="approved")  # pending | approved | rejected


class ServiceRequest(Base):
    """A single booking and its full lifecycle."""

    __tablename__ = "service_requests"

    id = Column(String, primary_key=True)
    customer_user_id = Column(String, ForeignKey("users.id"), nullable=True, index=True)
    customer_name = Column(String, nullable=False)
    customer_phone = Column(String, nullable=False)

    service_type = Column(String, nullable=False)
    location = Column(JSON, nullable=False)  # {address, lat, lng}
    date = Column(String, nullable=False)  # YYYY-MM-DD
    time_slot = Column(String, nullable=False)  # "16:00-18:00"
    urgency = Column(String, default="Normal")  # Normal | Urgent | Emergency
    problem_details = Column(String, default="")
    image_url = Column(String, nullable=True)

    provider_id = Column(String, ForeignKey("providers.id"), nullable=True, index=True)
    # Providers who already rejected this job — never offered to them again.
    rejected_provider_ids = Column(JSON, default=list)
    auto_assigned = Column(Boolean, default=False)

    status = Column(String, default="Requested", index=True)
    estimated_price = Column(Integer, default=0)
    base_price = Column(Integer, default=0)  # pre-surcharge, kept for the invoice

    # Status timeline — each stamp is set once, when that status is first reached.
    created_at = Column(DateTime, default=datetime.utcnow)
    accepted_at = Column(DateTime, nullable=True)
    on_the_way_at = Column(DateTime, nullable=True)
    in_progress_at = Column(DateTime, nullable=True)
    work_done_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)

    # Escrow & Dispute handling
    payment_status = Column(String, default="held")  # held | released | refunded
    dispute_note = Column(String, nullable=True)
    dispute_image_url = Column(String, nullable=True)
    dispute_created_at = Column(DateTime, nullable=True)
    dispute_resolution = Column(String, nullable=True)  # paid_provider | refunded_customer
    dispute_resolved_at = Column(DateTime, nullable=True)
    dispute_admin_note = Column(String, nullable=True)

    rating = Column(Float, nullable=True)
    feedback = Column(String, nullable=True)


class Notification(Base):
    """Simulated SMS/push feed. One row per event, addressed to one user."""

    __tablename__ = "notifications"

    id = Column(String, primary_key=True)
    user_id = Column(String, ForeignKey("users.id"), nullable=False, index=True)
    title = Column(String, nullable=False)
    body = Column(String, default="")
    kind = Column(String, default="info")  # info | success | warning | error
    request_id = Column(String, nullable=True)
    read = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)


class Invoice(Base):
    """Auto-generated on completion. Amounts are frozen at issue time."""

    __tablename__ = "invoices"

    id = Column(String, primary_key=True)
    request_id = Column(String, ForeignKey("service_requests.id"), nullable=False, index=True)
    invoice_no = Column(String, nullable=False, unique=True)
    base_amount = Column(Integer, default=0)
    urgency_surcharge = Column(Integer, default=0)
    service_fee = Column(Integer, default=0)
    vat = Column(Integer, default=0)
    total = Column(Integer, default=0)
    issued_at = Column(DateTime, default=datetime.utcnow)


def init_db():
    """Create every table that does not exist yet."""
    Base.metadata.create_all(bind=engine)


def get_db():
    """FastAPI dependency that yields a session and always closes it."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
