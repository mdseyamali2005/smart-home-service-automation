@echo off
setlocal

echo === Smart Home Service Automation ===
echo.

REM ── Backend ──────────────────────────────────────────────────────────────
cd /d "%~dp0backend"

if not exist ".venv\Scripts\activate.bat" (
    echo [1/5] Creating Python virtual environment...
    python -m venv .venv
)

echo [2/5] Installing backend dependencies...
call .venv\Scripts\activate.bat
pip install -r requirements.txt --quiet

echo [3/5] Seeding database...
python seed.py

echo [4/5] Starting backend on http://localhost:8000 ...
start "Smart Home Backend" cmd /k "call .venv\Scripts\activate.bat && uvicorn main:app --reload --port 8000"

REM ── Frontend ─────────────────────────────────────────────────────────────
cd /d "%~dp0frontend"

if not exist "node_modules" (
    echo [5/5] Installing frontend dependencies...
    npm install
)

echo [5/5] Starting frontend on http://localhost:5173 ...
start "Smart Home Frontend" cmd /k "npm run dev"

echo.
echo Both servers are starting. Open http://localhost:5173 in your browser.
echo Demo login is available on the landing page.
echo.
pause
