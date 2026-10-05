# Microscopy TIFF Explorer — Architecture

## 1. Overview

Microscopy TIFF Explorer is a web application for inspecting multidimensional microscopy TIFF files and exporting selected image planes as PNG or ZIP files. MVP v1 uses one active TIFF. The agreed v2 extension adds a temporary browser workspace containing multiple TIFFs and an ordered tray of pinned plane selections.

The MVP separates the browser UI, TIFF-processing API, and temporary file storage. It intentionally has no database, authentication, persistent uploads, or Supabase dependency.

## 2. Architecture Goals

The architecture prioritizes simplicity, fast MVP delivery, clear frontend/backend boundaries, reliable TIFF parsing, safe temporary-file handling, easy local development, public deployment, and future extensibility.

## 3. High-Level Architecture

```text
┌─────────────────────────────────┐
│ User Browser                    │
│ React + TypeScript + Vite       │
│                                 │
│ Upload • Metadata • T/Z/C/RGB   │
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
├── render.yaml
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
- RGB Color component state for metadata-confirmed RGB TIFFs
- Preview refreshes
- PNG and ZIP download initiation
- User-friendly error display

The v2 frontend additionally owns the ordered workspace file list, per-file active selector state, immutable pinned-selection state, thumbnail object URLs, and selected-image batch-download initiation. These remain session-local UI state and are not persisted across page reloads.

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

The v2 backend additionally validates multi-file selection manifests, enforces batch limits, leases every referenced upload during atomic export, renders selections one source file at a time, and creates grouped archives with a manifest.

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
  → choose T/Z/C and optional RGB Color component
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
  "metadata": {
    "shape": [5, 20, 3, 1024, 1024],
    "axes": "TZCYX",
    "dtype": "uint16",
    "width": 1024,
    "height": 1024,
    "time_points": 5,
    "z_slices": 20,
    "channels": 3,
    "series_count": 1,
    "is_rgb": false,
    "sample_count": 1,
    "rgb_components": []
  }
}
```

## 11. TIFF Parsing

Use `tifffile.TiffFile` and prefer `tif.series[0]` for the initial primary-series implementation. Use series metadata and OME/ImageJ metadata when present. Do not infer semantic axes solely from array shape.

The minimum supported structures are `YX`, `ZYX`, `CYX`, `ZCYX`, and `TZCYX`. Compatible permutations can be normalized internally when interpretation is safe.

## 12. Metadata Model

The upload response keeps `file_id` and the original `filename` at the top
level. Its nested `metadata` object includes:

- `shape`
- `axes`
- `dtype`
- `width`, `height`
- `time_points`, `z_slices`, `channels`
- `is_rgb`, `sample_count`, `rgb_components`
- optionally, series count and selected non-sensitive OME fields

Existing fields remain stable. `channels` always describes the microscopy `C` axis and never counts RGB samples. A metadata-confirmed RGB series reports `is_rgb: true`, `sample_count: 3`, and `rgb_components: ["red", "green", "blue"]` while preserving its original `S` axis in `axes`.

## 13. Semantic Plane Extraction

Plane selection should be axis-aware rather than position-assumed:

```python
extract_plane(array, axes, t=0, z=0, c=0, component="composite")
```

The service validates indices, maps each semantic selector to the correct array dimension, and preserves Y/X. `component` accepts `composite`, `red`, `green`, or `blue`. For an RGB series, `composite` preserves the grouped `S` axis and an individual component removes `S` to return a grayscale Y/X plane. For a non-RGB series, values other than `composite` are rejected. The RGB `S` axis remains separate from microscopy channels, including when both `C` and `S` are present.

## 14. Preview API

```http
GET /api/tiff/{file_id}/preview?t=0&z=0&c=0&component=composite
```

The response is `image/png`. Omitting `component` is backward-compatible and means `composite`. RGB composite responses are color PNGs; `red`, `green`, and `blue` responses are grayscale PNGs. The endpoint extracts the selected plane, normalizes it when necessary, encodes it in memory, and returns cache-safe headers appropriate for temporary research data.

## 15. Normalization

`uint8` values are preserved. `uint16` values use a shared `normalize_to_uint8` service with 1st/99th percentile clipping and explicit handling for a constant image (`upper == lower`). A composite RGB image uses one shared pair of bounds across all three samples to preserve relative color balance; an isolated component uses bounds from that component. Preview and export must call the same normalization function for the same selection.

## 16. PNG Export API

```http
GET /api/tiff/{file_id}/export/png?t=0&z=0&c=0&component=composite
```

The response uses `image/png` plus a download-oriented `Content-Disposition`. Filenames contain sanitized source information and zero-padded semantic indices. RGB filenames add `_RGB`, `_R`, `_G`, or `_B` so composite and separated exports cannot collide.

## 17. ZIP Export API

```http
GET /api/tiff/{file_id}/export/zip?component=composite
```

The MVP may export all available T/Z/C planes for the requested Color component. Omitting `component` exports RGB composites and preserves existing behavior. Selecting `red`, `green`, or `blue` exports that grayscale component across the stack. PNGs use deterministic component-aware names and the ZIP is generated temporarily or streamed. Generated archives are not retained permanently.

## 18. Temporary Storage

An upload is stored under a generated identifier, for example:

```text
<temp-root>/microscopy-tiff-explorer/<uuid>.tif
```

The original filename is metadata only and never controls a filesystem path.
Each in-memory record tracks the storage path, safe display filename, byte size,
and UTC creation time.

## 19. Cleanup Policy

The MVP v1 default TTL is 30 minutes and is configured by
`TEMP_FILE_TTL_MINUTES`. Request-time cleanup runs when a new upload starts and
when an existing upload is acquired. Expired records are removed from memory and
their TIFFs are deleted without requiring a browser `DELETE` call.

Preview and export obtain a reference-counted lease before reading a TIFF.
Cleanup marks an in-use expired record unavailable to new requests but defers
filesystem deletion until the final lease is released. This prevents concurrent
cleanup from removing a file during processing. Manager startup scans only
UUID-named `.tif` and `.tiff` files and deletes expired leftovers from an earlier
process; unrelated files are ignored. Delete failures are logged and do not stop
the remaining cleanup work.

PNG bytes live in memory. ZIP creation uses `SpooledTemporaryFile`; archive
creation and streaming both close the stream on success, failure, or interrupted
delivery.

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

Required codes include `INVALID_FILE_TYPE`, `FILE_TOO_LARGE`, `INVALID_TIFF`,
`UNSUPPORTED_DTYPE`, `UNSUPPORTED_AXES`, `FILE_NOT_FOUND`,
`INVALID_DIMENSION_INDEX`, `INVALID_RGB_COMPONENT`, `PROCESSING_ERROR`, and
`INVALID_REQUEST`.

Service, validation, HTTP routing, and unexpected API failures use the same
envelope. Unexpected details are logged server-side; responses do not expose
stack traces, exception classes, or server paths.

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

The 100 MB upload cap is a product and operational safeguard. Metadata parsing
does not load the pixel array. Preview and export currently load the primary
series before selecting planes, so provider memory and timeout limits can be
stricter than the upload cap. Whole-slide and multi-gigabyte processing are
outside MVP v1.

## 25. Testing Strategy

Backend unit tests should cover:

- Axis interpretation and plane extraction
- RGB detection and composite / Red / Green / Blue extraction without conflating `S` and `C`
- `uint8` pass-through
- `uint16` normalization, including constant data
- Upload validation and structured errors
- Safe filename and storage behavior
- Cleanup expiration

API tests should cover upload, metadata, preview, PNG, ZIP, invalid indices/components, RGB composite and separated components, and missing file IDs. Frontend tests should cover file validation, conditional T/Z/C and RGB component selectors, selection reset, loading/error states, and download actions.

## 26. Local Development

The expected default origins are:

```text
Frontend: http://localhost:5173
Backend:  http://localhost:8000
Health:   GET http://localhost:8000/health
```

Frontend and backend run independently so each can be tested and deployed separately.

## 27. Deployment

Deployment is prepared but not represented as publicly completed. The frontend
is configured as a static Vite build for a Vercel project rooted at `frontend/`.
The backend `render.yaml` defines a Render Python web service rooted at
`backend/`, starts Uvicorn with the provider's `PORT`, uses `/health`, and has no
persistent disk or database. Production requires an exact Vercel origin in
`ALLOWED_ORIGINS` and the Render origin in `VITE_API_BASE_URL`.

## 28. Observability

Unexpected processing and cleanup failures are logged server-side without
logging image content. A lightweight health endpoint supports deployment checks.

## 29. Accessibility and UX

The desktop-first UI has labeled controls, keyboard-accessible file selection
and buttons, `status`/`alert` announcements, visible focus styles, explicit
microscopy Channel versus RGB component help, responsive small-screen layouts,
and a contained preview. Replacing or clearing a file aborts stale operations,
resets selection, and releases object URLs.

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

For v2, a workspace remains temporary React state rather than a durable server-side project. Pinned selections are coordinate references, not stored image copies. A generic multi-file selection-export API is introduced before the multi-file UI so the API contract does not need to be replaced when additional TIFFs become available.

This is the smallest architecture that safely supports the agreed MVP while leaving clear extension points for later research-workflow features.

## 35. v2 Workspace State Model

The frontend state is split into source files, one active source, and pinned selections:

```ts
type WorkspaceFile = {
  clientId: string
  fileId: string
  filename: string
  displayName: string
  sizeBytes: number
  metadata: TiffMetadata
  activeSelection: {
    t: number
    z: number
    c: number
    component: RgbComponent
  }
  status: 'ready' | 'expired' | 'error'
}

type PinnedSelection = {
  id: string
  fileId: string
  t: number
  z: number
  c: number
  component: RgbComponent
  additionOrder: number
}
```

`PinnedSelection.id` is derived from or uniquely associated with
`fileId + t + z + c + component`. An exact duplicate cannot enter normal
frontend state. A pinned selection is immutable; changing the active selectors
creates a new candidate rather than editing existing pinned data.

The active file controls the metadata panel, selectors, and one full-size main
preview. Clicking a pinned thumbnail activates its source file and restores its
coordinates and component. Each file retains its last active selection while
the user switches sources.

No workspace state is written to `localStorage`. A reload starts a new browser
workspace because temporary file IDs may already be expired or invalid after a
backend restart.

## 36. v2 Selection Tray and Thumbnail Flow

The selection tray displays small previews rather than many full-resolution
images. The existing preview endpoint gains an optional bounded parameter:

```http
GET /api/tiff/{file_id}/preview?t=0&z=0&c=0&component=composite&max_size=240
```

`max_size` is optional. Omission preserves v1 behavior. When present, the
backend runs the existing extraction and normalization pipeline, then resizes
the display PNG while preserving aspect ratio. It does not change export
resolution or source metadata. The server validates an allowed range and the
selection tray requests a maximum edge of 240 pixels.

Thumbnail requests are lazy where practical. Browser object URLs are revoked
when a selection is removed, its source is removed, the workspace is cleared,
or the component unmounts. A thumbnail is presentation-only; successful batch
export never trusts or reuses its bytes as the scientific output.

## 37. v2 Selected-Image Export API

```http
POST /api/exports/selection
Content-Type: application/json
```

Request model:

```json
{
  "items": [
    {
      "file_id": "0a4c9a20-9f63-4bbb-b3a2-76f58a58b2dd",
      "t": 0,
      "z": 3,
      "c": 1,
      "component": "composite"
    }
  ]
}
```

The request order is the pinned addition order. The contract accepts multiple
`file_id` values from its first release even when Step 12 initially exposes it
through a single-file UI. It returns `application/zip` with an attachment
filename such as `microscopy-selection.zip`.

The response is atomic. Before response streaming begins, the backend validates:

- A non-empty item list.
- No exact duplicate selection.
- Item, distinct-file, and combined-source-size limits.
- Every UUID and temporary upload.
- Every T/Z/C coordinate and component against its source metadata.
- Unique, safe archive paths.

Any failure closes temporary archive resources and returns the structured error
envelope. The server never returns a successful ZIP that silently omits an
invalid or expired request item.

## 38. v2 Batch Rendering Strategy

Selected items are grouped by `file_id` while their original addition order is
retained for the manifest. The backend acquires leases for all distinct sources
in a consistent order before expensive work begins. This prevents an upload
from expiring between validation and later rendering.

Each source TIFF is processed sequentially:

```text
validate request
  → acquire all source leases
  → group selections by file_id
  → open one TIFF
  → load its primary series once
  → render every requested plane for that source
  → release its NumPy array
  → continue with the next source
  → write manifest.csv
  → stream and close the spooled ZIP
```

The implementation reuses semantic extraction, RGB component selection,
canonicalization, normalization, PNG encoding, and filename sanitation. It must
not reopen or reload the same TIFF for every selected item and must not keep all
source arrays resident simultaneously.

## 39. v2 Archive Layout and Manifest

Selected-image archives always use one generated folder per source, even for a
single source:

```text
microscopy-selection.zip
├── 01_sample-a/
│   ├── sample-a_T000_Z003_C001_RGB.png
│   └── sample-a_T000_Z002_C002_R.png
├── 02_sample-b/
│   └── sample-b_T001_Z000_C000_B.png
└── manifest.csv
```

Source folders are numbered by first appearance in the request. A sanitized
basename is used after the numeric prefix, so equal client filenames remain
separate. PNG basenames continue to use the v1 component-aware convention.

`manifest.csv` contains one row per selection in request order with at least:

```text
archive_path,source_filename,t,z,c,component
```

The manifest excludes `file_id`, storage paths, and other server internals.
CSV values are escaped safely, including formula-leading client filenames, so
opening the manifest in spreadsheet software cannot interpret an untrusted
filename as a formula.

## 40. v2 File Removal API

The multi-file UI should eagerly release a removed source:

```http
DELETE /api/tiff/{file_id}
```

Deletion is idempotent from the UI perspective. If a referenced source has
active leases, it becomes unavailable to new requests and physical deletion is
deferred until the final lease is released. Browser removal also removes every
dependent pinned selection after confirmation. TTL cleanup remains mandatory
when the browser cannot send DELETE.

## 41. v2 Limits and Configuration

The initial defaults are:

```text
MAX_WORKSPACE_FILES=3
MAX_WORKSPACE_SIZE_MB=200
MAX_PINNED_SELECTIONS=50
THUMBNAIL_MAX_SIZE_PX=240
TEMP_FILE_TTL_MINUTES=30
TEMP_FILE_MAX_LIFETIME_MINUTES=120
```

The individual upload limit remains `MAX_UPLOAD_SIZE_MB=100`. Frontend limits
mirror backend limits for immediate feedback, but backend enforcement is
authoritative. A selected export rejects more than three distinct sources, more
than 50 items, or sources whose combined recorded upload size exceeds 200 MB.

## 42. v2 Sliding Expiration

Each upload tracks both `created_at` and `last_accessed_at`. The inactivity TTL
is 30 minutes and the absolute lifetime is two hours. A successful full-size
or thumbnail preview, PNG export, stack ZIP export, or selected-image export
updates `last_accessed_at`, but never extends the absolute deadline.

Cleanup and acquisition remain lock-protected. An upload beyond either deadline
is unavailable to new acquisitions. An existing reference-counted lease may
finish, after which deletion occurs. Startup orphan cleanup uses safe managed
filenames and file timestamps as a conservative fallback because in-memory
access times do not survive process restarts.

## 43. v2 Error Contract Extensions

The existing envelope is retained. New codes are:

- `EMPTY_SELECTION`: no batch items were supplied.
- `BATCH_LIMIT_EXCEEDED`: file count, source-size, or selection count exceeded.
- `DUPLICATE_SELECTION`: the same file/T/Z/C/component tuple appeared twice.

Existing `FILE_NOT_FOUND`, `INVALID_DIMENSION_INDEX`,
`INVALID_RGB_COMPONENT`, and `PROCESSING_ERROR` apply to individual batch items.
The frontend may associate an error with its local display filename, but the API
does not disclose a server path. Partial batch success is not part of the
contract.

## 44. v2 Testing Strategy

Backend tests cover:

- Duplicate detection and empty/limit errors.
- Atomic behavior when one item is missing, expired, or invalid.
- One-time TIFF loading per source group.
- Interleaved and planar RGB selections across multiple sources.
- Independent microscopy `C` and RGB sample `S` behavior.
- Stable folder numbering, collision-free names, and safe CSV escaping.
- Full-resolution export despite thumbnail resizing.
- Multi-file leases, inactivity extension, absolute expiration, and removal.
- ZIP spool cleanup on success, error, and interrupted delivery.

Frontend tests cover:

- Immutable pinning, duplicate prevention, removal, and clear-all.
- Thumbnail lifecycle and object URL cleanup.
- Restoring a pinned item to the active preview.
- Adding files without clearing earlier files or selections.
- Per-file selector restoration and same-name display labels.
- Confirmation and dependent-selection cleanup on source removal.
- Selected ZIP request order, loading/error states, and download cleanup.
- Existing PNG and full-stack ZIP workflows without regressions.

