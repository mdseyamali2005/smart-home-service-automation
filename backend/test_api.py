"""
backend/test_api.py — regression suite for Smart Home Service Automation.

Run from the backend directory with the venv active:
    pytest test_api.py -v

The suite spins up the FastAPI app in-process via httpx.AsyncClient so no
running server is needed.  Each test class gets a fresh in-memory SQLite
database so tests never interfere with each other.
"""

import json
import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport

# ── app bootstrap ────────────────────────────────────────────────────────────
# Override DATABASE_URL before importing main so the app uses an in-memory DB.
import os
os.environ["DATABASE_URL"] = "sqlite:///:memory:"

from sqlalchemy import create_engine, event       # noqa: E402
from sqlalchemy.orm import sessionmaker            # noqa: E402
from sqlalchemy.pool import StaticPool             # noqa: E402

from models import Base, get_db                    # noqa: E402

# Create a test engine that shares a single in-memory DB across all connections.
test_engine = create_engine(
    "sqlite:///:memory:",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestSession = sessionmaker(autocommit=False, autoflush=False, bind=test_engine)

# Now import the app *after* we have the test engine ready.
from main import app  # noqa: E402

# Override the get_db dependency so every request uses the test database.
def _test_get_db():
    db = TestSession()
    try:
        yield db
    finally:
        db.close()

app.dependency_overrides[get_db] = _test_get_db

# Also patch models.engine / SessionLocal so that startup code (lifespan)
# that imports them directly still hits the test DB.
import models  # noqa: E402
models.engine = test_engine
models.SessionLocal = TestSession


# ── fixtures ─────────────────────────────────────────────────────────────────

@pytest_asyncio.fixture(autouse=True)
async def fresh_db():
    """Re-create all tables before each test and drop them after."""
    # Reset the in-memory booking map so slot locks don't leak between tests.
    import scheduling
    scheduling.booked_slots.clear()

    Base.metadata.create_all(bind=test_engine)
    yield
    Base.metadata.drop_all(bind=test_engine)


@pytest_asyncio.fixture
async def client():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        yield ac


# ── helpers ──────────────────────────────────────────────────────────────────

CUSTOMER_PAYLOAD = {
    "name": "Alice Rahman",
    "email": "alice@example.com",
    "phone": "01712345678",
    "password": "secret123",
    "default_location": {"address": "Mirpur 10, Dhaka", "lat": 23.8103, "lng": 90.3654},
}

PROVIDER_PAYLOAD = {
    "name": "Bob Mia",
    "business_name": "Bob's Plumbing",
    "email": "bob@example.com",
    "phone": "01898765432",
    "password": "secret123",
    "service_type": "Plumbing",
    "location": {"address": "Uttara, Dhaka", "lat": 23.8759, "lng": 90.3795},
    "price": 500,
    "expertise_tags": ["certified", "licensed"],
    "bio": "10 years experience",
}


async def register_customer(client: AsyncClient) -> dict:
    r = await client.post("/api/auth/signup/customer", json=CUSTOMER_PAYLOAD)
    assert r.status_code in (200, 201), r.text
    return r.json()


async def register_provider(client: AsyncClient, approve: bool = True) -> dict:
    r = await client.post("/api/auth/signup/provider", json=PROVIDER_PAYLOAD)
    assert r.status_code in (200, 201), r.text
    data = r.json()
    if approve:
        from models import Provider
        db = TestSession()
        prov = db.query(Provider).filter(Provider.user_id == data["user"]["id"]).first()
        if prov:
            prov.status = "approved"
            db.commit()
        db.close()
    return data


async def register_admin(client: AsyncClient) -> dict:
    from auth import create_token, hash_password, new_id
    from models import ROLE_ADMIN, User
    db = TestSession()
    admin = User(
        id=new_id("u"),
        role=ROLE_ADMIN,
        name="Admin Test",
        email="testadmin@example.com",
        phone="01811111111",
        password_hash=hash_password("adminpass123"),
    )
    db.add(admin)
    db.commit()
    token = create_token(admin.id)
    db.close()
    return {"token": token, "user": {"id": admin.id, "role": ROLE_ADMIN, "name": admin.name, "email": admin.email}}


def auth_header(session: dict) -> dict:
    return {"Authorization": f"Bearer {session['token']}"}


# ── auth tests ────────────────────────────────────────────────────────────────

class TestAuth:
    @pytest.mark.asyncio
    async def test_customer_signup_returns_token(self, client):
        data = await register_customer(client)
        assert "token" in data
        assert data["user"]["role"] == "customer"

    @pytest.mark.asyncio
    async def test_provider_signup_returns_token(self, client):
        data = await register_provider(client)
        assert "token" in data
        assert data["user"]["role"] == "provider"
        assert data["provider"]["service_type"] == "Plumbing"

    @pytest.mark.asyncio
    async def test_login_valid_credentials(self, client):
        await register_customer(client)
        r = await client.post("/api/auth/login", json={
            "email": "alice@example.com", "password": "secret123"
        })
        assert r.status_code == 200
        assert "token" in r.json()

    @pytest.mark.asyncio
    async def test_login_wrong_password(self, client):
        await register_customer(client)
        r = await client.post("/api/auth/login", json={
            "email": "alice@example.com", "password": "wrong"
        })
        assert r.status_code == 401

    @pytest.mark.asyncio
    async def test_me_returns_session(self, client):
        session = await register_customer(client)
        r = await client.get("/api/auth/me", headers=auth_header(session))
        assert r.status_code == 200
        assert r.json()["user"]["email"] == "alice@example.com"

    @pytest.mark.asyncio
    async def test_me_requires_token(self, client):
        r = await client.get("/api/auth/me")
        assert r.status_code == 401

    @pytest.mark.asyncio
    async def test_duplicate_email_rejected(self, client):
        await register_customer(client)
        r = await client.post("/api/auth/signup/customer", json=CUSTOMER_PAYLOAD)
        assert r.status_code == 409

    @pytest.mark.asyncio
    async def test_invalid_email_rejected(self, client):
        bad = {**CUSTOMER_PAYLOAD, "email": "not-an-email"}
        r = await client.post("/api/auth/signup/customer", json=bad)
        assert r.status_code == 422


# ── catalog tests ─────────────────────────────────────────────────────────────

class TestCatalog:
    @pytest.mark.asyncio
    async def test_categories_returns_eight(self, client):
        r = await client.get("/api/categories")
        assert r.status_code == 200
        cats = r.json()["categories"]
        assert len(cats) == 8

    @pytest.mark.asyncio
    async def test_providers_list_empty_initially(self, client):
        r = await client.get("/api/providers")
        assert r.status_code == 200
        assert r.json() == []

    @pytest.mark.asyncio
    async def test_providers_filtered_by_service_type(self, client):
        await register_provider(client)
        r = await client.get("/api/providers?service_type=Plumbing")
        assert r.status_code == 200
        providers = r.json()
        assert all(p["service_type"] == "Plumbing" for p in providers)

    @pytest.mark.asyncio
    async def test_provider_detail(self, client):
        session = await register_provider(client)
        provider_id = session["provider"]["id"]
        r = await client.get(f"/api/providers/{provider_id}")
        assert r.status_code == 200
        assert r.json()["id"] == provider_id

    @pytest.mark.asyncio
    async def test_unknown_provider_404(self, client):
        r = await client.get("/api/providers/nonexistent")
        assert r.status_code == 404

    @pytest.mark.asyncio
    async def test_availability_returns_days(self, client):
        r = await client.get("/api/availability?service_type=Plumbing&days=3")
        assert r.status_code == 200
        data = r.json()
        assert data["service_type"] == "Plumbing"
        assert len(data["days"]) == 3
        # Ensure slots have new status fields
        first_slot = data["days"][0]["slots"][0]
        assert "status" in first_slot
        assert "booked" in first_slot

    @pytest.mark.asyncio
    async def test_availability_filters_strictly_by_provider_id(self, client):
        # Register a provider with a specific published slot
        provider = await register_provider(client)
        from datetime import date, timedelta
        target_date = (date.today() + timedelta(days=1)).isoformat()
        target_slot = "10:00-12:00"

        # Publish only 1 slot
        await client.post(
            "/api/provider/me/slots",
            json={"date": target_date, "time_slot": target_slot},
            headers=auth_header(provider),
        )

        prov_id = provider["provider"]["id"]

        # Fetch availability specifically for this provider
        r = await client.get(
            f"/api/availability?service_type=Plumbing&days=3&provider_id={prov_id}"
        )
        assert r.status_code == 200
        data = r.json()
        day_info = next(d for d in data["days"] if d["date"] == target_date)
        
        # Check that the 3 default working slots are open, and 3 off slots are closed
        open_slots = [s for s in day_info["slots"] if s["available"]]
        closed_slots = [s for s in day_info["slots"] if not s["available"]]
        
        assert len(open_slots) == 3
        for os in open_slots:
            assert os["status"] == "open"
            assert os["available"] is True
            assert os["booked"] is False
        
        assert len(closed_slots) == 3
        for cs in closed_slots:
            assert cs["status"] == "closed"
            assert cs["available"] is False
            assert cs["booked"] is False

    @pytest.mark.asyncio
    async def test_availability_booked_slot_shows_booked_status(self, client):
        customer = await register_customer(client)
        provider = await register_provider(client)
        from datetime import date, timedelta
        target_date = (date.today() + timedelta(days=2)).isoformat()
        target_slot = "14:00-16:00"

        # Publish slot
        await client.post(
            "/api/provider/me/slots",
            json={"date": target_date, "time_slot": target_slot},
            headers=auth_header(provider),
        )

        prov_id = provider["provider"]["id"]

        # Customer books the slot
        req_res = await client.post(
            "/api/service-requests",
            json={
                "service_type": "Plumbing",
                "location": {"address": "Banani, Dhaka", "lat": 23.7937, "lng": 90.4066},
                "date": target_date,
                "time_slot": target_slot,
                "urgency": "Normal",
                "problem_details": "Leaking pipe",
                "customer_name": "Demo Test",
                "customer_phone": "01712345678",
                "chosen_provider_id": prov_id,
            },
            headers=auth_header(customer),
        )
        assert req_res.status_code == 201

        # Check availability for this provider now
        r = await client.get(
            f"/api/availability?service_type=Plumbing&days=4&provider_id={prov_id}"
        )
        assert r.status_code == 200
        data = r.json()
        day_info = next(d for d in data["days"] if d["date"] == target_date)
        booked_slot = next(s for s in day_info["slots"] if s["time_slot"] == target_slot)
        assert booked_slot["available"] is False
        assert booked_slot["status"] == "booked"
        assert booked_slot["booked"] is True

    @pytest.mark.asyncio
    async def test_status_flow_contains_transitions(self, client):
        r = await client.get("/api/status-flow")
        assert r.status_code == 200
        data = r.json()
        assert "flow" in data
        assert "transitions" in data


# ── service request lifecycle ─────────────────────────────────────────────────

class TestServiceRequests:
    async def _setup(self, client):
        """Create a customer, a provider with a published slot, return both sessions."""
        customer = await register_customer(client)
        provider = await register_provider(client)
        # Publish a slot so a request can be booked
        from datetime import date, timedelta
        slot_date = (date.today() + timedelta(days=1)).isoformat()
        r = await client.post("/api/provider/me/slots",
            json={"date": slot_date, "time_slot": "10:00-12:00"},
            headers=auth_header(provider))
        assert r.status_code == 200
        return customer, provider, slot_date

    @pytest.mark.asyncio
    async def test_create_request_auto_assign(self, client):
        customer, provider, slot_date = await self._setup(client)
        r = await client.post("/api/service-requests", json={
            "service_type": "Plumbing",
            "location": {"address": "Mirpur 10, Dhaka", "lat": 23.8103, "lng": 90.3654},
            "date": slot_date,
            "time_slot": "10:00-12:00",
            "urgency": "Normal",
            "problem_details": "Leaking pipe",
            "customer_name": "Alice Rahman",
            "customer_phone": "01712345678",
        }, headers=auth_header(customer))
        assert r.status_code in (200, 201)
        data = r.json()
        assert data["status"] == "Requested"
        assert data["provider_id"] is not None

    @pytest.mark.asyncio
    async def test_customer_can_read_own_request(self, client):
        customer, _, slot_date = await self._setup(client)
        create = await client.post("/api/service-requests", json={
            "service_type": "Plumbing",
            "location": {"address": "Mirpur 10, Dhaka", "lat": 23.8103, "lng": 90.3654},
            "date": slot_date, "time_slot": "10:00-12:00", "urgency": "Normal",
            "problem_details": "Dripping tap",
            "customer_name": "Alice Rahman", "customer_phone": "01712345678",
        }, headers=auth_header(customer))
        req_id = create.json()["id"]
        r = await client.get(f"/api/service-requests/{req_id}", headers=auth_header(customer))
        assert r.status_code == 200
        assert r.json()["id"] == req_id

    @pytest.mark.asyncio
    async def test_my_requests(self, client):
        customer, _, slot_date = await self._setup(client)
        await client.post("/api/service-requests", json={
            "service_type": "Plumbing",
            "location": {"address": "Mirpur 10, Dhaka", "lat": 23.8103, "lng": 90.3654},
            "date": slot_date, "time_slot": "10:00-12:00", "urgency": "Normal",
            "problem_details": "Water pressure low",
            "customer_name": "Alice Rahman", "customer_phone": "01712345678",
        }, headers=auth_header(customer))
        r = await client.get("/api/my/requests", headers=auth_header(customer))
        assert r.status_code == 200
        assert len(r.json()) >= 1

    @pytest.mark.asyncio
    async def test_provider_accepts_request(self, client):
        customer, provider, slot_date = await self._setup(client)
        create = await client.post("/api/service-requests", json={
            "service_type": "Plumbing",
            "location": {"address": "Mirpur 10, Dhaka", "lat": 23.8103, "lng": 90.3654},
            "date": slot_date, "time_slot": "10:00-12:00", "urgency": "Normal",
            "problem_details": "Blocked drain",
            "customer_name": "Alice Rahman", "customer_phone": "01712345678",
        }, headers=auth_header(customer))
        req_id = create.json()["id"]
        r = await client.patch(f"/api/service-requests/{req_id}/status",
            json={"new_status": "Accepted"}, headers=auth_header(provider))
        assert r.status_code == 200
        assert r.json()["status"] == "Accepted"

    @pytest.mark.asyncio
    async def test_customer_cancels_request(self, client):
        customer, _, slot_date = await self._setup(client)
        create = await client.post("/api/service-requests", json={
            "service_type": "Plumbing",
            "location": {"address": "Mirpur 10, Dhaka", "lat": 23.8103, "lng": 90.3654},
            "date": slot_date, "time_slot": "10:00-12:00", "urgency": "Urgent",
            "problem_details": "Burst pipe",
            "customer_name": "Alice Rahman", "customer_phone": "01712345678",
        }, headers=auth_header(customer))
        req_id = create.json()["id"]
        r = await client.post(f"/api/service-requests/{req_id}/cancel",
            headers=auth_header(customer))
        assert r.status_code == 200
        assert r.json()["status"] == "Cancelled"

    @pytest.mark.asyncio
    async def test_invalid_transition_rejected(self, client):
        """Jumping from Requested directly to Completed is not allowed."""
        customer, provider, slot_date = await self._setup(client)
        create = await client.post("/api/service-requests", json={
            "service_type": "Plumbing",
            "location": {"address": "Mirpur 10, Dhaka", "lat": 23.8103, "lng": 90.3654},
            "date": slot_date, "time_slot": "10:00-12:00", "urgency": "Normal",
            "problem_details": "Test",
            "customer_name": "Alice Rahman", "customer_phone": "01712345678",
        }, headers=auth_header(customer))
        req_id = create.json()["id"]
        r = await client.patch(f"/api/service-requests/{req_id}/status",
            json={"new_status": "Completed"}, headers=auth_header(provider))
        assert r.status_code in (400, 422)

    @pytest.mark.asyncio
    async def test_full_lifecycle_generates_invoice(self, client):
        customer, provider, slot_date = await self._setup(client)
        create = await client.post("/api/service-requests", json={
            "service_type": "Plumbing",
            "location": {"address": "Mirpur 10, Dhaka", "lat": 23.8103, "lng": 90.3654},
            "date": slot_date, "time_slot": "10:00-12:00", "urgency": "Normal",
            "problem_details": "Pipe leak",
            "customer_name": "Alice Rahman", "customer_phone": "01712345678",
        }, headers=auth_header(customer))
        req_id = create.json()["id"]
        ph = auth_header(provider)
        for status in ["Accepted", "On the Way", "In Progress", "Completed"]:
            r = await client.patch(f"/api/service-requests/{req_id}/status",
                json={"new_status": status}, headers=ph)
            assert r.status_code == 200, f"Failed at {status}: {r.text}"

        r = await client.get(f"/api/service-requests/{req_id}/invoice",
            headers=auth_header(customer))
        assert r.status_code == 200
        assert r.json()["total"] > 0


# ── provider portal tests ─────────────────────────────────────────────────────

class TestProviderPortal:
    @pytest.mark.asyncio
    async def test_publish_and_list_slots(self, client):
        from datetime import date, timedelta
        session = await register_provider(client)
        slot_date = (date.today() + timedelta(days=2)).isoformat()
        r = await client.post("/api/provider/me/slots",
            json={"date": slot_date, "time_slot": "14:00-16:00"},
            headers=auth_header(session))
        assert r.status_code == 200

        r = await client.get("/api/provider/me/slots", headers=auth_header(session))
        assert r.status_code == 200
        published_slots = [
            s for day in r.json()["days"]
            for s in day["slots"]
            if s["published"] and day["date"] == slot_date and s["time_slot"] == "14:00-16:00"
        ]
        assert len(published_slots) == 1

    @pytest.mark.asyncio
    async def test_unpublish_slot(self, client):
        from datetime import date, timedelta
        session = await register_provider(client)
        slot_date = (date.today() + timedelta(days=3)).isoformat()
        h = auth_header(session)
        await client.post("/api/provider/me/slots",
            json={"date": slot_date, "time_slot": "10:00-12:00"}, headers=h)
        r = await client.request("DELETE", "/api/provider/me/slots",
            content=json.dumps({"date": slot_date, "time_slot": "10:00-12:00"}),
            headers={**h, "Content-Type": "application/json"})
        assert r.status_code == 200

    @pytest.mark.asyncio
    async def test_stats_returns_expected_keys(self, client):
        session = await register_provider(client)
        r = await client.get("/api/provider/me/stats", headers=auth_header(session))
        assert r.status_code == 200
        data = r.json()
        for key in ("total_jobs", "completed", "total_earnings", "average_rating"):
            assert key in data, f"Missing key: {key}"

    @pytest.mark.asyncio
    async def test_update_profile(self, client):
        session = await register_provider(client)
        r = await client.patch("/api/provider/me/profile", json={
            "name": "Bob's Premium Plumbing",
            "price": 800,
            "location": {"address": "Gulshan 2, Dhaka", "lat": 23.7925, "lng": 90.4078},
        }, headers=auth_header(session))
        assert r.status_code == 200
        data = r.json()
        assert data["name"] == "Bob's Premium Plumbing"
        assert data["price"] == 800

    @pytest.mark.asyncio
    async def test_customer_cannot_access_provider_portal(self, client):
        session = await register_customer(client)
        r = await client.get("/api/provider/me/jobs", headers=auth_header(session))
        assert r.status_code == 403


# ── matching / preview ────────────────────────────────────────────────────────

class TestMatching:
    @pytest.mark.asyncio
    async def test_match_preview_returns_candidates(self, client):
        from datetime import date, timedelta
        provider_session = await register_provider(client)
        slot_date = (date.today() + timedelta(days=1)).isoformat()
        await client.post("/api/provider/me/slots",
            json={"date": slot_date, "time_slot": "10:00-12:00"},
            headers=auth_header(provider_session))

        customer_session = await register_customer(client)
        r = await client.post("/api/match-preview", json={
            "service_type": "Plumbing",
            "location": {"address": "Mirpur 10, Dhaka", "lat": 23.8103, "lng": 90.3654},
            "date": slot_date,
            "time_slot": "10:00-12:00",
            "urgency": "Normal",
        }, headers=auth_header(customer_session))
        assert r.status_code == 200
        data = r.json()
        assert "candidates" in data
        assert len(data["candidates"]) >= 1

    @pytest.mark.asyncio
    async def test_match_preview_no_providers_available(self, client):
        from datetime import date, timedelta
        customer_session = await register_customer(client)
        slot_date = (date.today() + timedelta(days=1)).isoformat()
        r = await client.post("/api/match-preview", json={
            "service_type": "Electrical",
            "location": {"address": "Mirpur 10, Dhaka", "lat": 23.8103, "lng": 90.3654},
            "date": slot_date,
            "time_slot": "10:00-12:00",
            "urgency": "Normal",
        }, headers=auth_header(customer_session))
        assert r.status_code == 200
        assert r.json()["candidates"] == []


# ── notifications ─────────────────────────────────────────────────────────────

class TestNotifications:
    @pytest.mark.asyncio
    async def test_notifications_list_initially_empty(self, client):
        session = await register_customer(client)
        r = await client.get("/api/notifications", headers=auth_header(session))
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    @pytest.mark.asyncio
    async def test_mark_notifications_read(self, client):
        session = await register_customer(client)
        r = await client.post("/api/notifications/mark-read",
            headers=auth_header(session))
        assert r.status_code == 200

    @pytest.mark.asyncio
    async def test_notification_timestamp_utc_format(self, client):
        from datetime import date, timedelta
        customer = await register_customer(client)
        provider = await register_provider(client)
        slot_date = (date.today() + timedelta(days=1)).isoformat()
        await client.post("/api/provider/me/slots",
            json={"date": slot_date, "time_slot": "10:00-12:00"},
            headers=auth_header(provider))

        sr_payload = {
            "service_type": "Plumbing",
            "location": {"address": "Banani, Dhaka", "lat": 23.7937, "lng": 90.4066},
            "date": slot_date,
            "time_slot": "10:00-12:00",
            "problem_details": "Need pipe repair",
            "urgency": "Normal",
            "customer_name": "Test Customer",
            "customer_phone": "01700000000",
        }
        r = await client.post("/api/service-requests", json=sr_payload, headers=auth_header(customer))
        assert r.status_code in (200, 201)

        notif_res = await client.get("/api/notifications", headers=auth_header(customer))
        assert notif_res.status_code == 200
        notifs = notif_res.json()
        assert len(notifs) >= 1
        created_at_str = notifs[0]["created_at"]
        assert created_at_str.endswith("Z") or "+00:00" in created_at_str


# ── admin ────────────────────────────────────────────────────────────────────

class TestAdmin:
    @pytest.mark.asyncio
    async def test_admin_stats(self, client):
        admin = await register_admin(client)
        r = await client.get("/api/admin/stats", headers=auth_header(admin))
        assert r.status_code == 200
        data = r.json()
        assert "total_income" in data
        assert "total_users" in data
        assert "income_by_day" in data

    @pytest.mark.asyncio
    async def test_provider_approval_workflow(self, client):
        admin = await register_admin(client)
        # Register a provider with approve=False (pending status)
        provider = await register_provider(client, approve=False)
        assert provider["provider"]["status"] == "pending"

        # Admin lists pending providers
        pending = await client.get("/api/admin/providers/pending", headers=auth_header(admin))
        assert pending.status_code == 200
        p_list = pending.json()
        assert any(p["provider_id"] == provider["provider"]["id"] for p in p_list)

        # Admin approves the provider
        approve = await client.patch(
            f"/api/admin/providers/{provider['provider']['id']}/approve",
            headers=auth_header(admin),
        )
        assert approve.status_code == 200

        # Now provider is no longer in pending list
        pending_after = await client.get("/api/admin/providers/pending", headers=auth_header(admin))
        assert not any(p["provider_id"] == provider["provider"]["id"] for p in pending_after.json())

    @pytest.mark.asyncio
    async def test_user_ban_toggle(self, client):
        admin = await register_admin(client)
        customer = await register_customer(client)
        user_id = customer["user"]["id"]

        # Admin bans user
        ban = await client.patch(f"/api/admin/users/{user_id}/ban", headers=auth_header(admin))
        assert ban.status_code == 200

        # Banned user cannot make requests (403 suspended)
        r = await client.get("/api/auth/me", headers=auth_header(customer))
        assert r.status_code == 403

        # Admin unbans user
        unban = await client.patch(f"/api/admin/users/{user_id}/ban", headers=auth_header(admin))
        assert unban.status_code == 200

        # Unbanned user can now access
        r2 = await client.get("/api/auth/me", headers=auth_header(customer))
        assert r2.status_code == 200


# ── escrow and dispute tests ──────────────────────────────────────────────────

class TestEscrowAndDisputes:
    async def _setup_work_done(self, client):
        """Helper: sets up a booking and moves it to Work Done stage."""
        from datetime import date, timedelta
        customer = await register_customer(client)
        provider = await register_provider(client)
        admin = await register_admin(client)
        slot_date = (date.today() + timedelta(days=2)).isoformat()

        # Publish slot
        await client.post(
            "/api/provider/me/slots",
            json={"date": slot_date, "time_slot": "14:00-16:00"},
            headers=auth_header(provider),
        )

        # Customer books
        create = await client.post(
            "/api/service-requests",
            json={
                "service_type": "Plumbing",
                "location": {"address": "Mirpur 10, Dhaka", "lat": 23.8103, "lng": 90.3654},
                "date": slot_date,
                "time_slot": "14:00-16:00",
                "urgency": "Normal",
                "problem_details": "Drain clogged",
                "customer_name": "Alice Rahman",
                "customer_phone": "01712345678",
            },
            headers=auth_header(customer),
        )
        assert create.status_code in (200, 201)
        req_id = create.json()["id"]

        # Provider advances to Work Done
        ph = auth_header(provider)
        for s in ["Accepted", "On the Way", "In Progress", "Work Done"]:
            r = await client.patch(
                f"/api/service-requests/{req_id}/status",
                json={"new_status": s},
                headers=ph,
            )
            assert r.status_code == 200, f"Failed transition to {s}: {r.text}"

        return customer, provider, admin, req_id

    @pytest.mark.asyncio
    async def test_escrow_work_done_holds_payment(self, client):
        customer, provider, admin, req_id = await self._setup_work_done(client)
        r = await client.get(f"/api/service-requests/{req_id}", headers=auth_header(customer))
        assert r.status_code == 200
        data = r.json()
        assert data["status"] == "Work Done"
        assert data["payment_status"] == "held"
        assert data["work_done_at"] is not None

        # Invoice must NOT be generated yet while funds are held in escrow
        inv = await client.get(f"/api/service-requests/{req_id}/invoice", headers=auth_header(customer))
        assert inv.status_code == 404

    @pytest.mark.asyncio
    async def test_customer_release_payment_completes_job_and_issues_invoice(self, client):
        customer, provider, admin, req_id = await self._setup_work_done(client)

        # Customer releases escrow payment
        r = await client.post(
            f"/api/service-requests/{req_id}/release-payment",
            headers=auth_header(customer),
        )
        assert r.status_code == 200
        data = r.json()
        assert data["status"] == "Completed"
        assert data["payment_status"] == "released"
        assert data["completed_at"] is not None

        # Invoice must now be generated
        inv = await client.get(f"/api/service-requests/{req_id}/invoice", headers=auth_header(customer))
        assert inv.status_code == 200
        assert inv.json()["total"] > 0

    @pytest.mark.asyncio
    async def test_customer_disputes_service(self, client):
        customer, provider, admin, req_id = await self._setup_work_done(client)

        # Customer files a dispute report
        r = await client.post(
            f"/api/service-requests/{req_id}/dispute",
            json={
                "note": "Work was not completed properly and pipe is still leaking.",
                "image_url": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
            },
            headers=auth_header(customer),
        )
        assert r.status_code == 200
        data = r.json()
        assert data["status"] == "Disputed"
        assert data["payment_status"] == "held"
        assert data["dispute_note"] == "Work was not completed properly and pipe is still leaking."
        assert data["dispute_image_url"] is not None
        assert data["dispute_created_at"] is not None

    @pytest.mark.asyncio
    async def test_admin_resolve_dispute_release_to_provider(self, client):
        customer, provider, admin, req_id = await self._setup_work_done(client)

        # Customer files dispute
        await client.post(
            f"/api/service-requests/{req_id}/dispute",
            json={"note": "Minor issue reported with drainage."},
            headers=auth_header(customer),
        )

        # Admin arbitrates: release payment to provider
        r = await client.patch(
            f"/api/admin/disputes/{req_id}/resolve",
            json={"action": "release", "admin_note": "Inspection shows work was fulfilled within scope."},
            headers=auth_header(admin),
        )
        assert r.status_code == 200
        data = r.json()
        assert data["status"] == "Completed"
        assert data["payment_status"] == "released"
        assert data["dispute_resolution"] == "paid_provider"
        assert data["dispute_admin_note"] == "Inspection shows work was fulfilled within scope."

        # Invoice generated
        inv = await client.get(f"/api/service-requests/{req_id}/invoice", headers=auth_header(admin))
        assert inv.status_code == 200

    @pytest.mark.asyncio
    async def test_admin_resolve_dispute_refund_to_customer(self, client):
        customer, provider, admin, req_id = await self._setup_work_done(client)

        # Customer files dispute
        await client.post(
            f"/api/service-requests/{req_id}/dispute",
            json={"note": "Job was completely defective and not fixed."},
            headers=auth_header(customer),
        )

        # Admin arbitrates: refund customer
        r = await client.patch(
            f"/api/admin/disputes/{req_id}/resolve",
            json={"action": "refund", "admin_note": "Verified defective work. Payout cancelled and customer refunded."},
            headers=auth_header(admin),
        )
        assert r.status_code == 200
        data = r.json()
        assert data["status"] == "Refunded"
        assert data["payment_status"] == "refunded"
        assert data["dispute_resolution"] == "refunded_customer"

        # Check that dispute appears in admin disputes list
        list_r = await client.get("/api/admin/disputes", headers=auth_header(admin))
        assert list_r.status_code == 200
        assert any(d["id"] == req_id for d in list_r.json())

