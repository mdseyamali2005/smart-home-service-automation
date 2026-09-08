"""
FastAPI application entry point.

Startup order:
    1. init_db()       — creates tables (no-op if they exist)
    2. seed_database() — loads mock data (no-op if providers table is non-empty)
    3. restore_bookings() — rebuilds the in-memory slot map from active DB rows
                            so a server restart never loses booking locks

The deprecated @app.on_event("startup") is replaced with the lifespan context
manager, which is the standard approach in FastAPI 0.93+.
"""

from contextlib import asynccontextmanager

import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from models import init_db
from scheduling import restore_bookings
from seed import seed_database


@asynccontextmanager
async def lifespan(app: FastAPI):
    # ── startup ──────────────────────────────────────────────────────────────
    init_db()
    seed_database()

    from models import SessionLocal
    from models import ServiceRequest

    db = SessionLocal()
    try:
        active_requests = db.query(ServiceRequest).all()
        restored = restore_bookings(active_requests)
        print(f"[startup] Restored {restored} active booking slot(s).")
    finally:
        db.close()

    yield
    # ── shutdown (nothing to do) ──────────────────────────────────────────────


app = FastAPI(
    title="Smart Home Service Automation",
    version="1.0.0",
    description=(
        "BAUST CSE FEST 2026 Hackathon — connects homeowners with verified "
        "local service providers through an intelligent matching engine."
    ),
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── routers ──────────────────────────────────────────────────────────────────
from routes.admin import router as admin_router
from routes.auth import router as auth_router
from routes.providers import router as providers_router
from routes.requests import router as requests_router

app.include_router(auth_router)
app.include_router(providers_router)
app.include_router(requests_router)
app.include_router(admin_router)


@app.get("/api/health")
def health():
    return {"status": "ok", "service": "Smart Home Service Automation"}


if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
