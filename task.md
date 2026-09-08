# task.md — Smart Home Service Automation

Work planned and tracked against the BAUST CSE FEST 2026 Hackathon challenge.

---

## Backend

- [x] `models.py` — SQLAlchemy ORM: User, Customer, Provider, ServiceRequest, Invoice, Notification
- [x] `auth.py` — PBKDF2-HMAC-SHA256 passwords, HMAC-SHA256 signed bearer tokens (stdlib only)
- [x] `schemas.py` — Pydantic v2 models; custom `Email` type (no email-validator dependency)
- [x] `scheduling.py` — O(1) in-memory booking map, rolling slot generation, `restore_bookings()`
- [x] `matching.py` — weighted provider scoring, Haversine distance, urgency-dependent weights, ETA
- [x] `state_machine.py` — `ALLOWED_TRANSITIONS`, actor enforcement, `PROGRESS_FLOW`, timestamp fields
- [x] `notifications.py` — in-app notification fan-out
- [x] `invoicing.py` — auto-invoice on Completed transition (base + surcharge + service fee + VAT)
- [x] `serializers.py` — ORM → Pydantic, batched provider lookup
- [x] `seed.py` — 24 providers (3 × 8 categories), 3 customers, rolling slot dates
- [x] `mock_data/providers.json` — 24 provider records
- [x] `mock_data/customers.json` — 3 customer records
- [x] `routes/auth.py` — signup/customer, signup/provider, login, me, demo-accounts
- [x] `routes/providers.py` — categories, providers, availability, status-flow, provider portal
- [x] `routes/requests.py` — service-requests CRUD, match-preview, cancel, status, rate, invoice
- [x] `main.py` — lifespan startup, CORS, router registration
- [x] `requirements.txt` — exact pinned versions
- [x] `test_api.py` — regression suite (auth, catalog, requests lifecycle, provider portal, matching, notifications)

---

## Frontend

- [x] `index.css` — design system: OKLCH tokens, dark mode, all component classes
- [x] `api.js` — all API calls with Bearer token auth, error normalisation
- [x] `context/AuthContext.jsx` — user/customer/provider session, unread count, reload
- [x] `context/ToastContext.jsx` — toast queue, success/error/info helpers
- [x] `components/Icon.jsx` — inline SVG icon set
- [x] `components/StatusBadge.jsx` — coloured status chip
- [x] `components/StarRating.jsx` — display + interactive modes
- [x] `components/Modal.jsx` — accessible dialog, backdrop click-to-close
- [x] `components/Skeleton.jsx` — shimmer skeletons matching final layouts
- [x] `components/Nav.jsx` — sticky nav, dark mode toggle, notification bell, sign-out
- [x] `components/ProtectedRoute.jsx` — role-gated route with skeleton loading state
- [x] `main.jsx` — StrictMode + BrowserRouter + AuthProvider + ToastProvider
- [x] `App.jsx` — full route tree: public, customer-only, provider-only, wildcard

### Customer pages
- [x] `pages/Landing.jsx` — hero, how-it-works, category grid, demo one-click login
- [x] `pages/Login.jsx` — email/password, post-login redirect, links to both signup flows
- [x] `pages/SignupCustomer.jsx` — name/email/password/phone/address, auto-login
- [x] `pages/SignupProvider.jsx` — account + business form, category select, tags, auto-login
- [x] `pages/CategoryGrid.jsx` — public service browser, expand to show providers per category
- [x] `pages/MyRequests.jsx` — list with urgency colouring, links to track
- [x] `pages/TrackRequest.jsx` — 5s polling, timeline, invoice, cancel modal, rating modal
- [x] `pages/RequestForm.jsx` — 4-step booking: category → slot → description+image → match preview
- [x] `pages/Notifications.jsx` — unread badge, timeAgo, mark-read on mount

### Provider pages
- [x] `pages/ProviderDashboard.jsx` — stats cards, recent jobs, quick nav
- [x] `pages/ProviderJobs.jsx` — active queue (urgency-sorted) + history tab, inline action buttons
- [x] `pages/ProviderAvailability.jsx` — 14-day slot calendar, toggle publish/unpublish
- [x] `pages/ProviderProfile.jsx` — edit name/price/location/tags/bio

---

## Launch / docs

- [x] `README.md` — setup, demo accounts, architecture, design decisions
- [x] `run.bat` — Windows one-command launcher (venv + seed + backend + frontend)
- [x] `run.sh` — Linux/macOS one-command launcher
