# NACC-RACCO I — AI-Integrated Child Behavioral Assessment & Counseling Support System

Capstone system for the National Authority for Child Care – Regional Alternative Child Care Office I (RACCO I).

Monorepo:
- `backend/` — Django + Django REST Framework API (SQLite, JWT auth)
- `frontend/` — React + Vite + Tailwind single-page app

See `docs/superpowers/specs/` for the design and `docs/superpowers/plans/` for the phase-by-phase build plans.

## Prerequisites
- Python 3.13+
- Node.js 18+ and npm

## Backend setup
```bash
cd backend
python -m venv venv
# activate the venv:
#   PowerShell:  ./venv/Scripts/Activate.ps1
#   Git Bash:    source venv/Scripts/activate
pip install -r requirements.txt
cp .env.example .env
python manage.py migrate
python manage.py seed_initial_data   # creates the 3 roles + default admin
python manage.py runserver           # http://localhost:8000
```

> **Optional (OCR):** digitizing *scanned/photo* instruments needs the free
> [Tesseract OCR](https://github.com/UB-Mannheim/tesseract/wiki) binary installed
> and on PATH. Text-based PDFs work without it; the manual builder always works.

Default admin account (created by the seed command):
- **Email:** `admin@racco1.gov.ph`
- **Password:** `admin1234`

## Frontend setup
```bash
cd frontend
npm install
npm run dev   # http://localhost:5173
```
The frontend reads the API base URL from `frontend/.env` (`VITE_API_BASE_URL`,
defaults to `http://localhost:8000/api`).

## Running tests
```bash
cd backend
# venv activated
python manage.py test
```

## Roles (Phase 1)
- **Administrator** — manages users, children, guardians; full access.
- **Staff** — manages children & guardian records.
- **Psychologist** — read-only access to children (assessment tools arrive in Phase 2).
- **Child Respondent** — guided survey interface (Phase 2; not a login account).

## Build status
Phase 1 (foundation) is complete: authentication, role-based access, the full
10-table data model, user management, and child/guardian management. Phases 2–4
(assessments, analysis + LLM recommendations, monitoring/reports) are planned in
`docs/superpowers/plans/`.
