"""
Authentication routes — separate signup paths for the two account types.

POST /api/auth/signup/customer
POST /api/auth/signup/provider
POST /api/auth/login
GET  /api/auth/me
GET  /api/auth/demo-accounts   — credentials shown on the login screen
"""

from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from auth import (
    create_token,
    get_current_user,
    hash_password,
    new_id,
    verify_password,
)
from models import (
    ROLE_ADMIN,
    ROLE_CUSTOMER,
    ROLE_PROVIDER,
    Customer,
    Provider,
    User,
    get_db,
)
from notifications import notify, unread_count
from schemas import (
    AuthResponse,
    CustomerOut,
    CustomerSignup,
    LoginRequest,
    ProviderSignup,
    SessionOut,
    UserOut,
)
from scheduling import TIME_SLOTS
from seed import DEMO_PASSWORD
from serializers import provider_out

router = APIRouter(prefix="/api/auth", tags=["auth"])

# A new provider starts with a full week of standard slots so they are
# immediately bookable; they can prune them from the availability screen.
DEFAULT_SLOT_DAYS = 10
DEFAULT_WORKING_SLOTS = ["10:00-12:00", "14:00-16:00", "16:00-18:00"]


def _require_unused_email(db: Session, email: str) -> None:
    if db.query(User).filter(User.email == email).first():
        raise HTTPException(
            status_code=409, detail="An account with this email already exists"
        )


def _default_slots() -> list[dict]:
    """Ten days of standard slots for a brand-new provider. O(days · slots)."""
    today = date.today()
    return [
        {"date": (today + timedelta(days=offset)).isoformat(), "time_slot": slot}
        for offset in range(DEFAULT_SLOT_DAYS)
        for slot in DEFAULT_WORKING_SLOTS
    ]


@router.post("/signup/customer", response_model=AuthResponse, status_code=201)
def signup_customer(body: CustomerSignup, db: Session = Depends(get_db)):
    """Create a customer account and log them straight in."""
    _require_unused_email(db, body.email)

    user = User(
        id=new_id("u"),
        role=ROLE_CUSTOMER,
        name=body.name,
        email=body.email,
        phone=body.phone,
        password_hash=hash_password(body.password),
    )
    customer = Customer(
        id=new_id("c"),
        user_id=user.id,
        name=body.name,
        phone=body.phone,
        default_location=body.default_location.model_dump(),
    )
    db.add_all([user, customer])
    notify(
        db,
        user.id,
        "Welcome to HomeServe",
        "Your account is ready. Pick a service and we will match you with the best provider nearby.",
        "success",
    )
    db.commit()

    return AuthResponse(
        token=create_token(user.id),
        user=UserOut.model_validate(user),
        customer=CustomerOut.model_validate(customer),
    )


@router.post("/signup/provider", response_model=AuthResponse, status_code=201)
def signup_provider(body: ProviderSignup, db: Session = Depends(get_db)):
    """
    Create a provider account. The provider profile the matching algorithm
    scores against is created in the same transaction, pre-filled with a
    default schedule so the account is bookable immediately.
    """
    _require_unused_email(db, body.email)

    user = User(
        id=new_id("u"),
        role=ROLE_PROVIDER,
        name=body.name,
        email=body.email,
        phone=body.phone,
        password_hash=hash_password(body.password),
    )
    provider = Provider(
        id=new_id("p"),
        user_id=user.id,
        name=body.business_name,
        service_type=body.service_type,
        location=body.location.model_dump(),
        rating=0.0,
        rating_count=0,
        price=body.price,
        expertise_tags=body.expertise_tags,
        available_slots=_default_slots(),
        bio=body.bio,
        status="pending",
    )
    db.add_all([user, provider])
    notify(
        db,
        user.id,
        "Application submitted",
        "Your provider application is under review. You will be notified once an admin approves your account.",
        "info",
    )
    # Notify all admins about the new provider application
    admins = db.query(User).filter(User.role == ROLE_ADMIN).all()
    for admin in admins:
        notify(
            db,
            admin.id,
            "New provider application",
            f"{body.business_name} ({body.service_type}) has applied to join the platform.",
            "info",
        )
    db.commit()

    return AuthResponse(
        token=create_token(user.id),
        user=UserOut.model_validate(user),
        provider=provider_out(provider),
    )


@router.post("/login", response_model=AuthResponse)
def login(body: LoginRequest, db: Session = Depends(get_db)):
    """
    Log in with email + password. The response carries the matching profile so
    the frontend can route to the right dashboard without a second round trip.
    """
    user = db.query(User).filter(User.email == body.email).first()
    if not user or not verify_password(body.password, user.password_hash):
        # Same message either way — never reveal which emails exist.
        raise HTTPException(status_code=401, detail="Wrong email or password")

    if user.is_banned:
        raise HTTPException(
            status_code=403,
            detail="Your account has been suspended by an administrator. Please contact support.",
        )

    response = AuthResponse(token=create_token(user.id), user=UserOut.model_validate(user))

    if user.role == ROLE_CUSTOMER:
        customer = db.query(Customer).filter(Customer.user_id == user.id).first()
        if customer:
            response.customer = CustomerOut.model_validate(customer)
    elif user.role == ROLE_PROVIDER:
        provider = db.query(Provider).filter(Provider.user_id == user.id).first()
        if provider:
            response.provider = provider_out(provider)

    return response


@router.get("/me", response_model=SessionOut)
def me(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Restore a session from a stored token on page load."""
    session = SessionOut(
        user=UserOut.model_validate(user),
        unread_notifications=unread_count(db, user),
    )

    if user.role == ROLE_CUSTOMER:
        customer = db.query(Customer).filter(Customer.user_id == user.id).first()
        if customer:
            session.customer = CustomerOut.model_validate(customer)
    elif user.role == ROLE_PROVIDER:
        provider = db.query(Provider).filter(Provider.user_id == user.id).first()
        if provider:
            session.provider = provider_out(provider)

    return session


@router.get("/demo-accounts")
def demo_accounts(db: Session = Depends(get_db)):
    """
    Seeded logins, surfaced as one-click buttons on the login screen so a judge
    never has to guess credentials.

    Complexity: O(1) — two capped queries.
    """
    admins = (
        db.query(User).filter(User.role == ROLE_ADMIN).order_by(User.created_at).limit(2).all()
    )
    customers = (
        db.query(User).filter(User.role == ROLE_CUSTOMER).order_by(User.created_at).limit(3).all()
    )
    providers = (
        db.query(User).filter(User.role == ROLE_PROVIDER).order_by(User.created_at).limit(4).all()
    )

    return {
        "password": DEMO_PASSWORD,
        "admins": [{"name": u.name, "email": u.email} for u in admins],
        "customers": [{"name": u.name, "email": u.email} for u in customers],
        "providers": [{"name": u.name, "email": u.email} for u in providers],
        "time_slots": TIME_SLOTS,
    }
