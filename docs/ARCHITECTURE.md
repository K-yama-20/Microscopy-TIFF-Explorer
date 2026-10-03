# Microscopy TIFF Explorer — Architecture

## 1. Overview

Microscopy TIFF Explorer is a web application for inspecting multidimensional microscopy TIFF files and exporting selected image planes as PNG or ZIP files.

The MVP separates the browser UI, TIFF-processing API, and temporary file storage. It intentionally has no database, authentication, persistent uploads, or Supabase dependency.

## 2. Architecture Goals

The architecture prioritizes simplicity, fast MVP delivery, clear frontend/backend boundaries, reliable TIFF parsing, safe temporary-file handling, easy local development, public deployment, and future extensibility.

## 3. High-Level Architecture

```text
┌─────────────────────────────────┐
│ User Browser                    │
│ React + TypeScript + Vite       │
│                                 │
│ Upload • Metadata • T/Z/C       │
│ Preview • PNG • ZIP             │
└────────────────┬────────────────┘
                 │ HTTPS / REST
                 ▼
┌─────────────────────────────────┐
│ FastAPI Backend                 │
│ Python + tifffile + NumPy       │
│ Pillow + zipfile                │
│                                 │
│ Validate • Parse • Extract      │
│ Normalize • Encode • Clean up   │
└────────────────┬────────────────┘
                 │
                 ▼
        Temporary local files
        UUID identifiers + TTL
```

## 4. Repository Layout

```text
Microscopy-TIFF-Explorer/
├── frontend/
│   ├── src/
│   │   ├── api/
│   │   ├── components/
│   │   ├── hooks/
│   │   ├── types/
│   │   └── utils/
│   └── package.json
├── backend/
│   ├── app/
│   │   ├── api/
│   │   ├── core/
│   │   ├── models/
│   │   ├── services/
│   │   └── main.py
│   ├── tests/
│   └── requirements.txt
├── docs/
│   ├── REQUIREMENTS.md
│   ├── ARCHITECTURE.md
│   └── ROADMAP.md
├── AGENTS.md
├── README.md
└── .gitignore
```

The detailed source layout is a recommended starting point and may be adjusted without changing architectural boundaries.

## 5. Frontend Responsibilities

The frontend owns:

- File selection and drag-and-drop
- Early extension and size validation
- Upload and processing states
- Metadata presentation
- T/Z/C selector state
- Preview refreshes
- PNG and ZIP download initiation
- User-friendly error display

It must not parse large multidimensional TIFF files itself for MVP v1.

## 6. Backend Responsibilities

The backend owns:

- Independent upload validation
- Safe temporary storage using server-generated identifiers
- TIFF parsing and metadata extraction
- Semantic axis interpretation
- Plane extraction
- 8-bit and 16-bit normalization
- PNG encoding and ZIP streaming/generation
- Structured errors
- Temporary-file expiration and cleanup

## 7. Frontend Technology

- React
- TypeScript
- Vite
- Browser Fetch API or a small HTTP client

The MVP should keep state local to the application unless complexity later justifies a dedicated state library.

## 8. Backend Technology

- Python
- FastAPI
- Uvicorn
- tifffile
- NumPy
- Pillow
- python-multipart
- Python `zipfile`

## 9. Core Data Flow

```text
Select TIFF
  → frontend validation
  → multipart upload
  → backend validation
  → UUID temporary storage
  → tifffile metadata parse
  → metadata response
  → choose T/Z/C
  → request plane
  → extract + normalize + PNG encode
  → browser preview or download
```

## 10. Upload API

```http
POST /api/tiff/upload
Content-Type: multipart/form-data
```

The backend validates extension and size, generates an opaque UUID `file_id`, stores the upload under a server-controlled path, parses the primary TIFF series, and returns metadata.

Example response:

```json
{
  "file_id": "a UUID",
  "filename": "sample.ome.tif",
  "shape": [5, 20, 3, 1024, 1024],
  "axes": "TZCYX",
  "dtype": "uint16",
  "width": 1024,
  "height": 1024,
  "time_points": 5,
  "z_slices": 20,
  "channels": 3
}
```

## 11. TIFF Parsing

Use `tifffile.TiffFile` and prefer `tif.series[0]` for the initial primary-series implementation. Use series metadata and OME/ImageJ metadata when present. Do not infer semantic axes solely from array shape.

The minimum supported structures are `YX`, `ZYX`, `CYX`, `ZCYX`, and `TZCYX`. Compatible permutations can be normalized internally when interpretation is safe.

## 12. Metadata Model

The normalized backend metadata model includes:

- `file_id`
- original `filename`
- `shape`
- `axes`
- `dtype`
- `width`, `height`
- `time_points`, `z_slices`, `channels`
- optionally, series count and selected non-sensitive OME fields

## 13. Semantic Plane Extraction

Plane selection should be axis-aware rather than position-assumed:

```python
extract_plane(array, axes, t=0, z=0, c=0)
```

The service validates indices, maps each semantic selector to the correct array dimension, preserves Y/X, and handles RGB sample axes separately from microscopy channels.

## 14. Preview API

```http
GET /api/tiff/{file_id}/preview?t=0&z=0&c=0
```

The response is `image/png`. The endpoint extracts the selected plane, normalizes it when necessary, encodes it in memory, and returns cache-safe headers appropriate for temporary research data.

## 15. Normalization

`uint8` values are preserved. `uint16` values use a shared `normalize_to_uint8` service with 1st/99th percentile clipping and explicit handling for a constant image (`upper == lower`). Preview and export must call the same normalization function.

## 16. PNG Export API

```http
GET /api/tiff/{file_id}/export/png?t=0&z=0&c=0
```

The response uses `image/png` plus a download-oriented `Content-Disposition`. Filenames contain sanitized source information and zero-padded semantic indices.

## 17. ZIP Export API

```http
GET /api/tiff/{file_id}/export/zip
```

The MVP may export all available T/Z/C planes. PNGs use deterministic names and the ZIP is generated temporarily or streamed. Generated archives are not retained permanently.

## 18. Temporary Storage

An upload is stored under a generated identifier, for example:

```text
<temp-root>/microscopy-tiff-explorer/<uuid>.tif
```

The original filename is metadata only and never controls a filesystem path. Temporary records should track the storage path, safe display filename, and timestamps.

## 19. Cleanup Policy

The initial TTL is 30 minutes. Cleanup must not depend exclusively on the browser calling a delete endpoint. The backend should remove expired uploads and generated artifacts through request-time cleanup, a background task, or a platform-appropriate scheduled mechanism.

An optional endpoint may support eager cleanup:

```http
DELETE /api/tiff/{file_id}
```

## 20. Error Contract

Errors should be stable and machine-readable:

```json
{
  "error": {
    "code": "INVALID_TIFF",
    "message": "The TIFF file could not be interpreted."
  }
}
```

Required codes include `INVALID_FILE_TYPE`, `FILE_TOO_LARGE`, `INVALID_TIFF`, `UNSUPPORTED_DTYPE`, `UNSUPPORTED_AXES`, `FILE_NOT_FOUND`, `INVALID_DIMENSION_INDEX`, and `PROCESSING_ERROR`.

Responses must not expose stack traces or server paths.

## 21. Validation and Security

- Validate extension and size in both frontend and backend.
- Treat client filenames and metadata as untrusted input.
- Use opaque identifiers and non-predictable storage paths.
- Sanitize download filenames.
- Restrict CORS to configured frontend origins.
- Set request and processing limits suitable for public deployment.
- Avoid persistent or publicly addressable uploads.

## 22. Configuration

Environment-specific values include:

```text
VITE_API_BASE_URL
ALLOWED_ORIGINS
MAX_UPLOAD_SIZE_MB=100
TEMP_FILE_TTL_MINUTES=30
TEMP_STORAGE_DIR
```

Do not commit secrets or environment-specific credentials.

## 23. CORS

Local development should allow the Vite origin, typically `http://localhost:5173`. Production must explicitly allow the deployed frontend origin rather than using unrestricted CORS.

## 24. Performance Boundaries

The 100 MB upload cap is a product and operational safeguard. Prefer lazy TIFF access or memory mapping where compatible, avoid unnecessary full-array copies, and generate previews one plane at a time. Whole-slide and multi-gigabyte processing are outside MVP v1.

## 25. Testing Strategy

Backend unit tests should cover:

- Axis interpretation and plane extraction
- `uint8` pass-through
- `uint16` normalization, including constant data
- Upload validation and structured errors
- Safe filename and storage behavior
- Cleanup expiration

API tests should cover upload, metadata, preview, PNG, ZIP, invalid indices, and missing file IDs. Frontend tests should cover file validation, conditional selectors, selection reset, loading/error states, and download actions.

## 26. Local Development

The expected default origins are:

```text
Frontend: http://localhost:5173
Backend:  http://localhost:8000
Health:   GET http://localhost:8000/health
```

Frontend and backend run independently so each can be tested and deployed separately.

## 27. Deployment

The frontend is deployed as a static Vite build to Vercel. The backend is deployed to Render, Railway, Google Cloud Run, or an equivalent Python host with adequate request size, timeout, memory, and ephemeral storage configuration.

## 28. Observability

Use structured server logs for request IDs, error codes, timing, and cleanup outcomes. Never log image content or sensitive metadata unnecessarily. A lightweight health endpoint supports deployment checks.

## 29. Accessibility and UX

The desktop-first UI should have labeled controls, keyboard-accessible file selection and buttons, readable loading/error states, and a preview constrained to the available viewport without silently changing selection.

## 30. No Database in MVP

No durable product data is required. In-memory metadata plus temporary files are sufficient. A database would add deployment and privacy complexity without improving the core upload-inspect-export workflow.

## 31. No Authentication in MVP

Authentication is deliberately excluded. This keeps the MVP focused and avoids creating user-data ownership and retention requirements before persistent data exists.

## 32. No Supabase in MVP

Supabase is excluded because the MVP does not need authentication, database records, persistent object storage, user history, or user-owned datasets.

## 33. Future Evolution

Future versions may add accounts, projects, datasets, persistent cloud storage, processing history, richer OME metadata, annotations, image-analysis jobs, and AI inference. Those additions should sit behind the existing API boundary rather than moving TIFF processing into the browser.

Possible evolution:

```text
React frontend
      │
      ▼
FastAPI application API
      ├── TIFF processing services
      ├── background job queue
      ├── relational database
      └── private object storage
```

## 34. Architectural Decision Summary

- Browser UI: React + TypeScript + Vite
- Processing API: FastAPI/Python
- TIFF library: tifffile with NumPy and Pillow
- Communication: REST over HTTPS
- Storage: opaque, temporary local files with TTL
- Output: normalized PNG and temporary ZIP
- Persistence, accounts, database, Supabase: excluded from MVP v1

This is the smallest architecture that safely supports the agreed MVP while leaving clear extension points for later research-workflow features.

