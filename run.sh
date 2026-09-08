#!/usr/bin/env bash
set -e
ROOT="$(cd "$(dirname "$0")" && pwd)"

echo "=== Smart Home Service Automation ==="
echo

# ── Backend ──────────────────────────────────────────────────────────────────
cd "$ROOT/backend"

if [ ! -d ".venv" ]; then
    echo "[1/5] Creating Python virtual environment..."
    python3 -m venv .venv
fi

echo "[2/5] Installing backend dependencies..."
source .venv/bin/activate
pip install -r requirements.txt --quiet

echo "[3/5] Seeding database..."
python seed.py

echo "[4/5] Starting backend on http://localhost:8000 ..."
uvicorn main:app --reload --port 8000 &
BACKEND_PID=$!

# ── Frontend ──────────────────────────────────────────────────────────────────
cd "$ROOT/frontend"

if [ ! -d "node_modules" ]; then
    echo "[5/5] Installing frontend dependencies..."
    npm install
fi

echo "[5/5] Starting frontend on http://localhost:5173 ..."
npm run dev &
FRONTEND_PID=$!

echo
echo "Both servers are running."
echo "  Backend:  http://localhost:8000"
echo "  Frontend: http://localhost:5173"
echo
echo "Press Ctrl+C to stop both servers."

trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit 0" INT TERM
wait
