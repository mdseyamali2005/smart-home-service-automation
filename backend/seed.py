"""
Seed the database from `mock_data/*.json`.

Two things here matter more than they look:

1. **Slots are generated relative to today**, not hardcoded. The previous
   version pinned availability to three fixed dates, so the app started
   answering "no providers available" for every date once those passed. Now
   every provider gets rolling availability for the next `SLOT_HORIZON_DAYS`.

2. **Every seeded provider and customer gets a real login.** The demo is
   supposed to show two account types, so mock rows without accounts would be
   unreachable. Email is derived from the name; password is DEMO_PASSWORD.

Seeding is idempotent — it returns early if the providers table is populated.
"""

import json
import os
import re
from datetime import date, datetime, timedelta

from auth import hash_password, new_id
from invoicing import generate_invoice
from models import (
    ROLE_ADMIN,
    ROLE_CUSTOMER,
    ROLE_PROVIDER,
    Customer,
    Provider,
    ServiceRequest,
    SessionLocal,
    User,
    init_db,
)

MOCK_DATA_DIR = os.path.join(os.path.dirname(__file__), "mock_data")

# How many days ahead providers publish availability.
SLOT_HORIZON_DAYS = 10

# Shared password for every seeded account, surfaced on the login screen.
DEMO_PASSWORD = "demo1234"


def slug_email(name: str) -> str:
    """`"CoolTech AC Care"` → `"cooltech.ac.care@demo.com"`."""
    slug = re.sub(r"[^a-z0-9]+", ".", name.lower()).strip(".")
    return f"{slug}@demo.com"


def generate_slots(working_slots: list[str], off_day_offsets: list[int]) -> list[dict]:
    """
    Expand a provider's weekly pattern into concrete dated slots, starting
    today and skipping their days off.

    Complexity: O(days · slots per day).
    """
    today = date.today()
    off_days = set(off_day_offsets or [])
    return [
        {"date": (today + timedelta(days=offset)).isoformat(), "time_slot": time_slot}
        for offset in range(SLOT_HORIZON_DAYS)
        if offset not in off_days
        for time_slot in working_slots
    ]


def _load(filename: str):
    with open(os.path.join(MOCK_DATA_DIR, filename), "r", encoding="utf-8") as handle:
        return json.load(handle)


def _seed_providers(db) -> int:
    """Create a User + Provider pair for every row in providers.json."""
    providers = _load("providers.json")

    for row in providers:
        user = User(
            id=new_id("u"),
            role=ROLE_PROVIDER,
            name=row["name"],
            email=slug_email(row["name"]),
            phone=f"0181{row['id'][1:]}000",
            password_hash=hash_password(DEMO_PASSWORD),
        )
        db.add(user)
        db.add(
            Provider(
                id=row["id"],
                user_id=user.id,
                name=row["name"],
                service_type=row["service_type"],
                location=row["location"],
                rating=row["rating"],
                rating_count=row.get("rating_count", 0),
                price=row["price"],
                expertise_tags=row["expertise_tags"],
                available_slots=generate_slots(
                    row["working_slots"], row.get("off_day_offsets", [])
                ),
                bio=row.get("bio", ""),
                status="approved",
            )
        )
    return len(providers)


def _seed_customers(db) -> int:
    """Create a User + Customer pair for every row in customers.json."""
    customers = _load("customers.json")

    for row in customers:
        user = User(
            id=new_id("u"),
            role=ROLE_CUSTOMER,
            name=row["name"],
            email=row["email"],
            phone=row["phone"],
            password_hash=hash_password(DEMO_PASSWORD),
        )
        db.add(user)
        db.add(
            Customer(
                id=row["id"],
                user_id=user.id,
                name=row["name"],
                phone=row["phone"],
                default_location=row["default_location"],
            )
        )
def _seed_admins(db) -> int:
    """Create the platform administrator account."""
    admin = User(
        id=new_id("u"),
        role=ROLE_ADMIN,
        name="System Administrator",
        email="admin@demo.com",
        phone="01810000001",
        password_hash=hash_password(DEMO_PASSWORD),
    )
    db.add(admin)
    return 1


# Past, already-finished jobs so the history, earnings and rating screens have
# something real to show on first launch. Dates are in the past, so these hold
# no slots and cannot collide with a live booking.
_HISTORY = [
    {
        "provider_id": "p001",
        "customer_id": "c001",
        "service_type": "Appliance & Gadget Repair",
        "days_ago": 6,
        "time_slot": "16:00-18:00",
        "problem": "AC not cooling, water dripping from the indoor unit.",
        "price": 1000,
        "urgency": "Normal",
        "rating": 5.0,
        "feedback": "Came on time, fixed the drainage and cleaned up after.",
    },
    {
        "provider_id": "p007",
        "customer_id": "c001",
        "service_type": "Electrical",
        "days_ago": 3,
        "time_slot": "10:00-12:00",
        "problem": "Bedroom switchboard sparking when the AC starts.",
        "price": 920,
        "urgency": "Urgent",
        "rating": 4.0,
        "feedback": "Good work, arrived a little late.",
    },
    {
        "provider_id": "p010",
        "customer_id": "c002",
        "service_type": "Cleaning & Pest Control",
        "days_ago": 2,
        "time_slot": "08:00-10:00",
        "problem": "Full flat deep clean before moving in.",
        "price": 1500,
        "urgency": "Normal",
        "rating": 5.0,
        "feedback": "Spotless. Booking again next month.",
    },
]


def _seed_history(db) -> int:
    """Insert the completed sample jobs, each with its invoice."""
    customers = {c.id: c for c in db.query(Customer).all()}

    for row in _HISTORY:
        customer = customers.get(row["customer_id"])
        if not customer:
            continue

        completed_on = datetime.utcnow() - timedelta(days=row["days_ago"])
        request = ServiceRequest(
            id=new_id("sr"),
            customer_user_id=customer.user_id,
            customer_name=customer.name,
            customer_phone=customer.phone,
            service_type=row["service_type"],
            location=customer.default_location,
            date=(date.today() - timedelta(days=row["days_ago"])).isoformat(),
            time_slot=row["time_slot"],
            urgency=row["urgency"],
            problem_details=row["problem"],
            provider_id=row["provider_id"],
            rejected_provider_ids=[],
            status="Completed",
            base_price=row["price"],
            estimated_price=row["price"],
            created_at=completed_on - timedelta(hours=5),
            accepted_at=completed_on - timedelta(hours=4),
            on_the_way_at=completed_on - timedelta(hours=2),
            in_progress_at=completed_on - timedelta(hours=1),
            completed_at=completed_on,
            rating=row["rating"],
            feedback=row["feedback"],
        )
        db.add(request)
        db.flush()  # the invoice needs the request's id
        generate_invoice(db, request)

    return len(_HISTORY)


def seed_database() -> None:
    """Create tables and load mock data if the database is empty."""
    init_db()
    db = SessionLocal()

    try:
        # If database has providers, ensure admin account exists
        if db.query(Provider).count() > 0:
            existing_admin = db.query(User).filter(User.role == ROLE_ADMIN).first()
            if not existing_admin:
                _seed_admins(db)
                db.commit()
                print("[seed] Admin account added to existing database.")
            print("[seed] Database already populated — skipping full re-seed.")
            return

        admin_count = _seed_admins(db)
        provider_count = _seed_providers(db)
        customer_count = _seed_customers(db)
        db.flush()
        history_count = _seed_history(db)
        db.commit()

        print(
            f"[seed] {admin_count} admin, {provider_count} providers, {customer_count} customers, "
            f"{history_count} historical jobs. Login password: {DEMO_PASSWORD}"
        )
    except Exception as error:  # pragma: no cover — surfaces a bad JSON edit
        db.rollback()
        print(f"[seed] FAILED: {error}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    seed_database()
