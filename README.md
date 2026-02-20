# Rodinný tábor

Landing page for the family camp with email pre-registration.  
Visitors leave their email to be notified when camp registrations open.

## Stack

| Layer    | Tech                                      |
|----------|-------------------------------------------|
| Frontend | React 18 + Vite 5 + TypeScript            |
| Backend  | FastAPI + UV + Motor (async MongoDB)      |
| Database | MongoDB                                   |
| Email    | Gmail SMTP via `aiosmtplib`               |

## Project structure

```
family_camp/
├── backend/          # FastAPI app (UV / Python)
│   ├── app/
│   │   ├── main.py
│   │   ├── config.py
│   │   ├── database.py
│   │   ├── models.py
│   │   ├── routers/register.py
│   │   └── services/email.py
│   ├── pyproject.toml
│   └── .env.example
└── frontend/         # Vite + React + TypeScript
    ├── src/
    │   ├── App.tsx
    │   ├── index.css
    │   └── components/
    │       ├── HeroSection.tsx
    │       ├── CampInfo.tsx
    │       └── RegisterForm.tsx
    └── index.html
```

## Getting started

### Prerequisites

- Python ≥ 3.11
- [uv](https://docs.astral.sh/uv/) (`pip install uv` or see uv docs)
- Node.js ≥ 18
- MongoDB running locally (default: `mongodb://localhost:27017`)

### Backend setup

```bash
cd backend

# Copy and fill in environment variables
cp .env.example .env

# Install dependencies and start the dev server
uv sync
uv run uvicorn app.main:app --reload
# API available at http://localhost:8000
```

### Gmail SMTP

1. Enable 2-Step Verification on your Google account.
2. Go to **Google Account → Security → App Passwords**.
3. Create an App Password for "Mail".
4. Set `GMAIL_USER` and `GMAIL_APP_PASSWORD` in `backend/.env`.

### Frontend setup

```bash
cd frontend
npm install
npm run dev
# Dev server available at http://localhost:5173
# API calls are proxied to http://localhost:8000
```

### Build for production

```bash
cd frontend
npm run build
# Output in frontend/dist/ – serve via FastAPI or a web server
```
