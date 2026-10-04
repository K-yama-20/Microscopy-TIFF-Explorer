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

The frontend uploads valid files to `POST /api/tiff/upload` as multipart form
data. A successful upload returns HTTP `201` with an opaque file identifier
and normalized metadata from the primary TIFF series:

```json
{
  "file_id": "95ed59ce-198b-4f17-89da-74e17d457df3",
  "filename": "sample.ome.tif",
  "metadata": {
    "shape": [2, 10, 3, 512, 512],
    "axes": "TZCYX",
    "dtype": "uint16",
    "width": 512,
    "height": 512,
    "time_points": 2,
    "z_slices": 10,
    "channels": 3,
    "series_count": 1
  }
}
```

The backend reads the upload in chunks, enforces its own extension and size
checks, stores the file as `<uuid>.tif` or `<uuid>.tiff`, and parses metadata
without loading the full pixel array. Invalid TIFFs and files with unsupported
data types or ambiguous axes return structured errors and are removed. When
`TEMP_STORAGE_DIR` is unset, files are written beneath the operating system's
temporary directory in `microscopy-tiff-explorer/`. Upload metadata is kept in
memory for later processing steps; no database or permanent storage is used.

Backend runtime settings are supplied as environment variables:

```powershell
$env:TEMP_STORAGE_DIR = "C:\path\to\temporary-storage"
$env:MAX_UPLOAD_SIZE_MB = "100"
$env:ALLOWED_ORIGINS = "http://localhost:5173"
```

`ALLOWED_ORIGINS` accepts a comma-separated list. Its default is limited to the
local Vite origins `http://localhost:5173` and `http://127.0.0.1:5173`.

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
selection, pre-upload validation, temporary upload through the FastAPI backend,
display of normalized primary-series TIFF metadata, and zero-based T/Z/C
selection for axes present in the uploaded image. The backend currently supports
`uint8` and `uint16` data with unambiguous combinations of the T, Z, C, Y, and X
axes, including `YX`, `ZYX`, `CYX`, `ZCYX`, and `TZCYX`.

