# Microscopy TIFF Explorer

Microscopy TIFF Explorer is a browser-based tool for inspecting multidimensional microscopy TIFF files and exporting selected image planes.

The MVP will let users upload `.tif` or `.tiff` files up to 100 MB, inspect metadata, select T/Z/C positions, preview 8-bit and 16-bit images, download a selected plane as PNG, and export multiple planes as ZIP.

## Stack

- Frontend: React, TypeScript, Vite
- Backend: Python, FastAPI, tifffile, NumPy, Pillow
- Storage: temporary files only; no database or persistent uploads
- Deployment: Vercel for the frontend and a Python-compatible service for the backend

## Local development

### Prerequisites

- Node.js 20.19+ or 22.12+ with pnpm 10+
- Python 3.11+

### Frontend

```powershell
cd frontend
pnpm install
pnpm dev
```

Open `http://localhost:5173`. To use a different API origin, copy
`frontend/.env.example` to `frontend/.env` and update `VITE_API_BASE_URL`.

### Backend

From the repository root on Windows PowerShell:

```powershell
python -m venv backend/.venv
backend/.venv/Scripts/python -m pip install -r backend/requirements-dev.txt
backend/.venv/Scripts/python -m uvicorn app.main:app --app-dir backend --reload --port 8000
```

On macOS or Linux, replace `backend/.venv/Scripts/python` with
`backend/.venv/bin/python`. The API is available at `http://localhost:8000`, and
`GET http://localhost:8000/health` returns `{ "status": "ok" }`.

### Quality checks

```powershell
cd frontend
pnpm format:check
pnpm lint
pnpm test
pnpm build

cd ../backend
.venv/Scripts/python -m ruff format --check .
.venv/Scripts/python -m ruff check .
.venv/Scripts/python -m pytest
```

## Repository structure

```text
Microscopy-TIFF-Explorer/
├── frontend/
├── backend/
├── docs/
│   ├── REQUIREMENTS.md
│   ├── ARCHITECTURE.md
│   └── ROADMAP.md
├── AGENTS.md
├── README.md
└── .gitignore
```

Implementation is organized into ten roadmap steps. See
[`docs/ROADMAP.md`](docs/ROADMAP.md). The frontend currently supports local TIFF
selection and pre-upload validation. API upload, TIFF processing, and persistent
storage are not included at this stage.

