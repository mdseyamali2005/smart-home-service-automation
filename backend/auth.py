"""
Authentication — password hashing and bearer tokens, standard library only.

Passwords : PBKDF2-HMAC-SHA256, 120k iterations, 16-byte random salt.
Tokens    : `base64url(payload).base64url(hmac_sha256(payload))` where the
            payload is `user_id:expiry_epoch`. Stateless, tamper-evident, and
            needs no extra dependency (no PyJWT / passlib / bcrypt).

Why not JWT? A hackathon demo needs two things from a token — it must identify
the user and it must not be forgeable. A signed HMAC blob does both in 40 lines
and removes a dependency that would need installing on the demo machine.

Complexity: hashing is O(iterations) by design (~80 ms, deliberately slow);
token sign/verify are O(1).
"""

import base64
import hashlib
import hmac
import os
import secrets
import time
import uuid

from fastapi import Depends, HTTPException, Request
from sqlalchemy.orm import Session

from models import ROLE_ADMIN, ROLE_CUSTOMER, ROLE_PROVIDER, User, get_db

# In a real deployment this comes from the environment. The fallback keeps the
# demo runnable with zero setup — tokens simply do not survive a restart.
SECRET_KEY = os.getenv("SECRET_KEY", secrets.token_hex(32))

TOKEN_TTL_SECONDS = 60 * 60 * 24 * 7  # 7 days
PBKDF2_ITERATIONS = 120_000


# --------------------------------------------------------------------------- #
# Passwords
# --------------------------------------------------------------------------- #

def hash_password(password: str) -> str:
    """Return `pbkdf2_sha256$<iterations>$<salt_hex>$<hash_hex>`."""
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac(
        "sha256", password.encode("utf-8"), salt, PBKDF2_ITERATIONS
    )
    return f"pbkdf2_sha256${PBKDF2_ITERATIONS}${salt.hex()}${digest.hex()}"


def verify_password(password: str, stored: str) -> bool:
    """Constant-time check of a plaintext password against a stored hash."""
    try:
        algo, iterations, salt_hex, digest_hex = stored.split("$")
        if algo != "pbkdf2_sha256":
            return False
        digest = hashlib.pbkdf2_hmac(
            "sha256", password.encode("utf-8"), bytes.fromhex(salt_hex), int(iterations)
        )
        return hmac.compare_digest(digest.hex(), digest_hex)
    except (ValueError, AttributeError):
        return False


# --------------------------------------------------------------------------- #
# Tokens
# --------------------------------------------------------------------------- #

def _b64(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")


def _unb64(text: str) -> bytes:
    padding = "=" * (-len(text) % 4)
    return base64.urlsafe_b64decode(text + padding)


def create_token(user_id: str) -> str:
    """Sign a token that identifies `user_id` and expires in TOKEN_TTL_SECONDS."""
    payload = f"{user_id}:{int(time.time()) + TOKEN_TTL_SECONDS}".encode("utf-8")
    signature = hmac.new(SECRET_KEY.encode("utf-8"), payload, hashlib.sha256).digest()
    return f"{_b64(payload)}.{_b64(signature)}"


def read_token(token: str) -> str | None:
    """Return the user id if the signature is valid and unexpired, else None."""
    try:
        payload_b64, signature_b64 = token.split(".")
        payload = _unb64(payload_b64)
        expected = hmac.new(
            SECRET_KEY.encode("utf-8"), payload, hashlib.sha256
        ).digest()
        if not hmac.compare_digest(_unb64(signature_b64), expected):
            return None
        user_id, expiry = payload.decode("utf-8").rsplit(":", 1)
        if int(expiry) < int(time.time()):
            return None
        return user_id
    except (ValueError, AttributeError, TypeError):
        return None


def new_id(prefix: str) -> str:
    """Short, readable, collision-safe id — e.g. `u-3f9a1c2b`."""
    return f"{prefix}-{uuid.uuid4().hex[:8]}"


# --------------------------------------------------------------------------- #
# FastAPI dependencies
# --------------------------------------------------------------------------- #

def _bearer(request: Request) -> str | None:
    header = request.headers.get("Authorization", "")
    if header.lower().startswith("bearer "):
        return header[7:].strip()
    return None


def get_current_user(request: Request, db: Session = Depends(get_db)) -> User:
    """Resolve the caller from the Authorization header, or 401."""
    token = _bearer(request)
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")

    user_id = read_token(token)
    if not user_id:
        raise HTTPException(status_code=401, detail="Session expired — please log in again")

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=401, detail="Account no longer exists")
    if user.is_banned:
        raise HTTPException(status_code=403, detail="Your account has been suspended. Contact support.")
    return user


def get_optional_user(request: Request, db: Session = Depends(get_db)) -> User | None:
    """Same as `get_current_user` but returns None instead of raising."""
    token = _bearer(request)
    if not token:
        return None
    user_id = read_token(token)
    if not user_id:
        return None
    return db.query(User).filter(User.id == user_id).first()


def require_customer(user: User = Depends(get_current_user)) -> User:
    if user.role != ROLE_CUSTOMER:
        raise HTTPException(status_code=403, detail="Customer account required")
    return user


def require_provider(user: User = Depends(get_current_user)) -> User:
    if user.role != ROLE_PROVIDER:
        raise HTTPException(status_code=403, detail="Provider account required")
    return user


def require_admin(user: User = Depends(get_current_user)) -> User:
    if user.role != ROLE_ADMIN:
        raise HTTPException(status_code=403, detail="Admin access required")
    return user
