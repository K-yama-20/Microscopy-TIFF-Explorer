# Microscopy TIFF Explorer

Microscopy TIFF Explorer is a browser-based tool for inspecting multidimensional microscopy TIFF files and exporting selected image planes.

The MVP will let users upload `.tif` or `.tiff` files up to 100 MB, inspect metadata, select T/Z/C positions, preview 8-bit and 16-bit images, download a selected plane as PNG, and export multiple planes as ZIP.

## Planned stack

- Frontend: React, TypeScript, Vite
- Backend: Python, FastAPI, tifffile, NumPy, Pillow
- Storage: temporary files only; no database or persistent uploads
- Deployment: Vercel for the frontend and a Python-compatible service for the backend

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

Implementation is organized into ten roadmap steps. See [`docs/ROADMAP.md`](docs/ROADMAP.md).

