# JeevaRaksha
Saving Lives Through Smart Technology. FastAPI + SQLite backend serving a vanilla HTML/CSS/JS frontend.

## Run locally
    cd JeevaRaksha/backend
    python -m venv .venv && source .venv/bin/activate   (Windows: .venv\Scripts\activate)
    pip install -r requirements.txt
    cp .env.example .env        (optional, only for real AI answers)
    uvicorn main:app --reload
Open http://127.0.0.1:8000. To use the AI key, run `export ANTHROPIC_API_KEY=...` (Windows: `set ANTHROPIC_API_KEY=...`) before uvicorn; never put it in frontend code or GitHub.

## Real versus simulated
Real: registration, hashed passwords, sessions, history, uploads, rule-based symptom guidance. Demo: assistant replies without a key. Not provided: report interpretation, automatic alerts.

## Limitations
No login rate limiting, email verification or password reset; set `secure=True` on the cookie under HTTPS. Replace team@example.com in index.html. Deploy on any host that runs Python (Render, Railway); SQLite and uploads need a persistent disk.
