# Smart Home Service Automation

BAUST CSE FEST 2026 Hackathon — Team Submission

A two-sided marketplace connecting homeowners with vetted service providers. Customers book plumbing, electrical, cleaning, and other home services; providers manage their availability, accept jobs, and track earnings — all without a single phone call.

---

## Quick start (one command)

**Windows**
```
run.bat
```

**Linux / macOS**
```
bash run.sh
```

Both scripts create a Python virtual environment, install all dependencies, seed the database with demo data, and start the backend + frontend dev servers. Open **http://localhost:5173** in your browser.

---

## Manual setup

### Requirements

| Tool | Minimum version |
|------|----------------|
| Python | 3.11 |
| Node.js | 18 |
| npm | 9 |

### Backend

```bash
cd backend
python -m venv .venv
# Windows:
.venv\Scripts\activate
# Linux/macOS:
source .venv/bin/activate

pip install -r requirements.txt
python seed.py          # creates smart_home.db with 24 providers + 3 customers
uvicorn main:app --reload --port 8000
```

### Frontend

```bash
cd frontend
npm install
npm run dev             # http://localhost:5173
```

The Vite dev server proxies `/api` → `http://localhost:8000`, so no CORS configuration is needed.

---

## Demo accounts

One-click login is available on the landing page. Alternatively:

| Role | Email | Password |
|------|-------|----------|
| Customer | customer1@demo.com | demo1234 |
| Customer | customer2@demo.com | demo1234 |
| Provider | provider1@demo.com | demo1234 |
| Provider | provider4@demo.com | demo1234 |

---

## Architecture

```
smart-home-service-automation/
├── backend/
│   ├── main.py            FastAPI app + lifespan startup
│   ├── models.py          SQLAlchemy ORM (User, Customer, Provider,
│   │                        ServiceRequest, Invoice, Notification)
│   ├── schemas.py         Pydantic request/response models
│   ├── auth.py            PBKDF2-HMAC-SHA256 + HMAC-SHA256 signed tokens
│   ├── matching.py        Weighted provider scoring (distance, rating,
│   │                        workload, urgency), Haversine, ETA
│   ├── scheduling.py      O(1) in-memory booking map, slot generation
│   ├── state_machine.py   Status transitions + actor enforcement
│   ├── notifications.py   In-app notification fan-out
│   ├── invoicing.py       Auto-invoice on Completed transition
│   ├── serializers.py     ORM → Pydantic, batched provider fetch
│   ├── seed.py            24 providers × 8 categories + 3 customers
│   ├── routes/
│   │   ├── auth.py        /api/auth/*
│   │   ├── providers.py   /api/categories, /api/providers,
│   │   │                    /api/availability, /api/provider/me/*
│   │   └── requests.py    /api/service-requests/*, /api/match-preview
│   └── requirements.txt
└── frontend/
    └── src/
        ├── api.js          All API calls (Bearer token, error normalisation)
        ├── index.css       Design system: OKLCH tokens, dark mode,
        │                     all component classes
        ├── context/
        │   ├── AuthContext.jsx
        │   └── ToastContext.jsx
        ├── components/
        │   ├── Icon.jsx         Inline SVG icon set
        │   ├── Modal.jsx        Accessible dialog
        │   ├── Nav.jsx          Sticky nav, dark mode toggle, notifications
        │   ├── ProtectedRoute.jsx
        │   ├── Skeleton.jsx
        │   ├── StarRating.jsx   Display + interactive mode
        │   └── StatusBadge.jsx
        └── pages/
            ├── Landing.jsx       Hero, how-it-works, demo login
            ├── Login.jsx
            ├── SignupCustomer.jsx
            ├── SignupProvider.jsx
            ├── CategoryGrid.jsx  Public service browser
            ├── RequestForm.jsx   4-step booking (category → slot → problem → match)
            ├── MyRequests.jsx
            ├── TrackRequest.jsx  Live polling, timeline, invoice, rating
            ├── Notifications.jsx
            ├── ProviderDashboard.jsx
            ├── ProviderJobs.jsx
            ├── ProviderAvailability.jsx
            └── ProviderProfile.jsx
```

---

## Key design decisions

**No external auth library.** Passwords: PBKDF2-HMAC-SHA256, 260 000 iterations, per-user salt. Tokens: `base64url(JSON payload).base64url(HMAC-SHA256 sig)` — stdlib only, no PyJWT.

**No email-validator or python-multipart.** Email validated with a regex `AfterValidator`; images sent as base64 data URLs in the JSON body.

**SQLite by default, Postgres with one env var.** Set `DATABASE_URL=postgresql://...` and nothing else changes — SQLAlchemy handles the rest.

**Weighted provider matching.** Score = w_dist × (1 − norm_dist) + w_rating × norm_rating + w_load × (1 − norm_load). Weights shift with urgency: Emergency leans heavily on distance and load, Normal balances all three.

**State machine.** `ALLOWED_TRANSITIONS` dict enforces who can move to what status. A provider can't mark a job complete without accepting it first; a customer can't cancel after the provider has arrived.

**O(1) slot booking.** In-memory `dict[(provider_id, date, slot)] → request_id` avoids a DB query on every availability check. Restored from active requests at startup via `restore_bookings()`.
