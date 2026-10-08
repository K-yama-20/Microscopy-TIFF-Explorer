# Microscopy TIFF Explorer

Microscopy TIFF Explorer is a browser-based MVP for inspecting multidimensional
microscopy TIFF files. It keeps up to three TIFFs in a temporary browser
workspace, shows primary-series metadata, lets the user choose microscopy
Time/Z/Channel and RGB color components per file, previews the selected plane,
downloads it as PNG, and exports the complete T/Z/C stack as ZIP. Multiple
planes from any workspace TIFF can be pinned in one ordered thumbnail tray for
later review, individual export, or one atomic selected-image ZIP export with a
CSV manifest.

There is no account, database, upload history, or persistent file storage.

## Features

- Independent frontend and backend validation for `.tif` and `.tiff` files up
  to 100 MB by default.
- Primary-series metadata: source shape and axes, dtype, width, height, T/Z/C
  counts, series count, RGB status, sample count, and RGB component names.
- Zero-based T, Z, and microscopy Channel (`C`) selectors when those axes exist.
- Metadata-confirmed RGB in interleaved `YXS`, planar `SYX`, and compatible
  T/Z/C combinations.
- RGB composite plus Red, Green, and Blue grayscale component views.
- A three-file temporary workspace with per-file selector state, same-name
  display labels, accessible switching, eager removal, and isolated failures.
- An immutable shared selection tray with 240-pixel thumbnails, exact duplicate
  prevention by source and coordinates, selection restoration, removal, and
  individual PNG downloads.
- Atomic selected-image ZIP export with full-resolution PNGs grouped by source,
  deterministic safe paths, and an ordered formula-safe `manifest.csv`.
- Matching preview and PNG/ZIP output through shared extraction,
  canonicalization, normalization, and PNG encoding services.
- Automatic temporary-upload expiration after 30 minutes by default.
- Stable, structured API errors without server paths or stack traces.
- Keyboard-accessible controls, announced loading/error states, responsive
  layout, constrained image previews, and reduced-motion support.

## Supported data model

The required non-RGB layouts are `YX`, `ZYX`, `CYX`, `ZCYX`, and `TZCYX`.
Other unambiguous permutations using `T`, `Z`, `C`, `Y`, and `X` can also be
processed. Pixel dtype must be `uint8` or `uint16`.

`C` and `S` have different meanings:

- `C` is a microscopy acquisition channel and is independently selectable.
- `S` is the grouped Red/Green/Blue sample axis inside one RGB image plane.

An RGB TIFF is accepted only when TIFF metadata reports RGB photometric data,
three samples per pixel, and an `S` axis of length three. Both interleaved `YXS`
and planar `SYX` are supported. A TIFF containing both `C` and `S` keeps them
independent; `S` does not increase the displayed Channel count or ZIP entry
count.

Upload metadata preserves the source axes order. Only an extracted result is
canonicalized: RGB composite becomes `YXS`, while grayscale and an isolated
R/G/B component become `YX`.

`uint8` values are preserved. `uint16` is converted for browser display and
8-bit export with 1st/99th percentile clipping. RGB composite uses one shared
pair of bounds across all samples so relative color balance is retained; an
isolated component uses its own bounds. Constant images safely produce a
uniform image.

## Local development

### Prerequisites

- Node.js 24.x
- pnpm 10+
- Python 3.11+

### Backend

From the repository root in Windows PowerShell:

```powershell
python -m venv backend/.venv
backend/.venv/Scripts/python -m pip install -r backend/requirements-dev.txt
$env:ALLOWED_ORIGINS = "http://localhost:5173"
$env:MAX_UPLOAD_SIZE_MB = "100"
$env:TEMP_FILE_TTL_MINUTES = "30"
backend/.venv/Scripts/python -m uvicorn app.main:app --app-dir backend --reload --port 8000
```

On macOS or Linux, use `backend/.venv/bin/python`. `backend/.env.example` is a
configuration reference; the application intentionally reads process
environment variables and does not automatically load that file.

Verify readiness at `GET http://localhost:8000/health`.

### Frontend

In another terminal:

```powershell
cd frontend
pnpm install --frozen-lockfile
pnpm dev
```

Open `http://localhost:5173`. The default backend is
`http://localhost:8000`. To override it, copy `frontend/.env.example` to
`frontend/.env`, set `VITE_API_BASE_URL`, and restart Vite.

### Use the application

1. Choose or drag in a supported TIFF.
2. Select **Upload TIFF** and review primary-series metadata.
3. Optionally choose another TIFF and select **Add TIFF**. Up to three files can
   coexist, and the newest successful upload becomes active.
4. Choose available Time, Z, and microscopy Channel positions. Switching files
   restores each file's last selection.
5. For an RGB TIFF, separately choose RGB composite, Red, Green, or Blue.
6. Review the live preview.
7. Select **Add to selection** to pin the current coordinates and RGB component;
   select a thumbnail later to restore that exact view.
8. Select **Download selected (N) as ZIP** to export only the pinned images;
   successful export leaves the tray unchanged.
9. Download or remove individual pinned images, or clear the tray.
10. Select **Download PNG** for the current plane.
11. Select **Export Stack as ZIP** for all T/Z/C planes in the current RGB
   component mode.

Removing a workspace file removes only its related pinned images after
confirmation. Reset clears the browser workspace. File removal, switching, and
reset abort obsolete requests and release browser object URLs. Workspace state
is never written to browser storage and a reload starts empty.

## API

| Method   | Endpoint                                                                   | Purpose                                                          |
| -------- | -------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `GET`    | `/health`                                                                  | Deployment readiness check                                       |
| `POST`   | `/api/tiff/upload`                                                         | Validate, temporarily store, and inspect a TIFF                  |
| `DELETE` | `/api/tiff/{file_id}`                                                      | Eagerly release a temporary TIFF                                 |
| `GET`    | `/api/tiff/{file_id}/preview?t=0&z=0&c=0&component=composite&max_size=240` | Preview one plane as PNG, optionally bounded by its longest edge |
| `GET`    | `/api/tiff/{file_id}/export/png?t=0&z=0&c=0&component=composite`           | Download one plane as PNG                                        |
| `GET`    | `/api/tiff/{file_id}/export/zip?component=composite`                       | Download all T/Z/C planes as ZIP                                 |
| `POST`   | `/api/exports/selection`                                                   | Download requested pinned planes as one atomic ZIP               |

`component` accepts `composite`, `red`, `green`, or `blue`. Omission is
backward-compatible and means `composite`. R/G/B is invalid for non-RGB data.
`max_size` is optional and accepts `1` through `4096`; omission preserves the
full-size preview. Resizing occurs only after normal extraction and
normalization, never enlarges the image, and does not affect PNG or ZIP exports.

The selected-image endpoint accepts ordered
`file_id`/`t`/`z`/`c`/`component` items. It rejects empty or duplicate batches,
more than 50 items, more than three distinct sources, or sources whose recorded
sizes total more than 200 MB. The archive always creates a numbered source
folder, includes one full-resolution PNG per request item, and writes
`manifest.csv` in request order. A failure in any item fails the whole request.

All API errors use this envelope:

```json
{
  "error": {
    "code": "INVALID_TIFF",
    "message": "The TIFF file could not be interpreted."
  }
}
```

| Code                      | Meaning                                                       |
| ------------------------- | ------------------------------------------------------------- |
| `INVALID_FILE_TYPE`       | Filename extension is not `.tif` or `.tiff`                   |
| `FILE_TOO_LARGE`          | Upload exceeds the configured maximum                         |
| `INVALID_TIFF`            | Content cannot be parsed as TIFF                              |
| `UNSUPPORTED_DTYPE`       | Pixel type is not `uint8` or `uint16`                         |
| `UNSUPPORTED_AXES`        | Axes or sample model is missing, ambiguous, or unsupported    |
| `FILE_NOT_FOUND`          | `file_id` is unknown, expired, deleted, or unavailable        |
| `INVALID_DIMENSION_INDEX` | T, Z, or C is outside the available range                     |
| `INVALID_RGB_COMPONENT`   | Component is unknown or not valid for this image              |
| `PROCESSING_ERROR`        | Preview/export or another unexpected operation failed safely  |
| `INVALID_REQUEST`         | Required input is missing or a request parameter is malformed |
| `EMPTY_SELECTION`         | Selected-image export contains no items                        |
| `DUPLICATE_SELECTION`     | The same source/coordinate/component appears more than once    |
| `BATCH_LIMIT_EXCEEDED`    | Selected-image item, source, or combined-size limit is exceeded |

## Runtime configuration

| Variable                | Type                    | Default                              | Notes                                                                                |
| ----------------------- | ----------------------- | ------------------------------------ | ------------------------------------------------------------------------------------ |
| `VITE_API_BASE_URL`     | URL string              | `http://localhost:8000`              | Frontend build-time backend origin; omit trailing slash                              |
| `ALLOWED_ORIGINS`       | comma-separated origins | local Vite origins                   | Exact browser origins only; wildcard is rejected and trailing slashes are normalized |
| `MAX_UPLOAD_SIZE_MB`    | positive integer        | `100`                                | Backend upload limit; frontend currently validates against the same MVP limit        |
| `TEMP_FILE_TTL_MINUTES` | positive number         | `30`                                 | Temporary TIFF lifetime                                                              |
| `TEMP_STORAGE_DIR`      | directory path          | OS temp + `microscopy-tiff-explorer` | Must be ephemeral in production                                                      |

Invalid numeric configuration fails startup with a clear configuration error.
Do not put credentials in these files or variables; the application needs no
secrets.

## Temporary-file lifecycle

Uploads are stored as server-generated UUID filenames. The original filename is
display metadata only and never becomes a storage path. Each in-memory record
stores its creation time. Cleanup runs on new uploads and existing-file API
access, expires records after `TEMP_FILE_TTL_MINUTES`, and removes their TIFFs.

Preview and export acquire a short-lived lease, so another request cannot delete
the source TIFF while it is being read. Once expired, new requests receive
`FILE_NOT_FOUND`; an already-running request completes and the file is removed
when its lease ends. On startup, cleanup also removes old UUID-named `.tif` and
`.tiff` files left by an earlier process, while ignoring unrelated files.

Workspace removal calls the idempotent DELETE endpoint. A leased file becomes
unavailable to new work immediately, but physical deletion waits for the final
lease. If the browser cannot confirm DELETE, local removal still succeeds and
TTL cleanup remains the fallback.

PNG output is generated in memory. ZIP output uses a spooled temporary stream
that is closed after normal delivery, generation failure, or interrupted
streaming. No export artifact is retained.

## Quality checks

```powershell
cd backend
.venv/Scripts/python -m ruff format --check .
.venv/Scripts/python -m ruff check .
.venv/Scripts/python -m pytest

cd ../frontend
pnpm format:check
pnpm lint
pnpm test
pnpm build

cd ..
git diff --check
git status --short
```

Small generated/manual fixtures are documented in `manual-test-data/README.md`.

## Deployment preparation

The intended split is Vercel for the static frontend and Render for the FastAPI
backend. No database or persistent disk is used.

### Backend on Render

`render.yaml` defines a free Python web service rooted at `backend/`, installs
`requirements.txt`, starts `app.main:app` with Uvicorn on Render's `$PORT`, and
checks `/health`. Import the repository as a Render Blueprint, then provide the
exact deployed Vercel origin for `ALLOWED_ORIGINS` when prompted. Do not use `*`
and do not append `/`. The remaining defaults are declared in the Blueprint,
including `/tmp/microscopy-tiff-explorer` as ephemeral storage.

The configuration follows Render's current
[Blueprint specification](https://render.com/docs/blueprint-spec),
[FastAPI deployment guide](https://render.com/docs/deploy-fastapi), and
[health-check documentation](https://render.com/docs/health-checks).

### Frontend on Vercel

Create a Vercel project for this repository and set **Root Directory** to
`frontend/`. Vercel detects Vite; `frontend/vercel.json` records the install,
build, and `dist` output settings. Set `VITE_API_BASE_URL` to the deployed Render
origin without a trailing slash, then deploy again so the build embeds it.

This follows Vercel's current
[monorepo Root Directory guidance](https://vercel.com/docs/monorepos) and
[`vercel.json` reference](https://vercel.com/docs/project-configuration/vercel-json).

After both services are live, verify `/health`, exact-origin CORS (including
exposed `Content-Disposition`), non-RGB and RGB upload/metadata/selectors,
preview, PNG, ZIP, and expiration behavior. Public deployment is not represented
as complete until real URLs and those checks exist.

## Security and privacy boundaries

- The server independently validates extension, size, TIFF metadata, dtype,
  axes, sample model, indices, and component.
- Opaque UUIDs control storage names; client filenames are sanitized for display
  and download headers.
- API responses do not expose filesystem paths, exception classes, or stack
  traces. Unexpected details remain server-side logs.
- CORS is restricted to configured exact origins and exposes only the download
  filename header needed by the frontend.
- Processing is temporary, unauthenticated, and not appropriate for data that
  requires user-level access control or durable retention.

## Current limitations

- Only the primary TIFF series is selectable.
- Only TIFF and `uint8`/`uint16` pixels are supported.
- RGBA, alpha, non-RGB `S`, and sample models other than exactly three RGB
  samples are unsupported.
- There is no authentication, database, persistent storage, history,
  annotation, image editing, or AI inference.
- In-memory `file_id` mappings are lost on server restart; an old UUID-named TIFF
  can be cleaned later but cannot be used after restart.
- Provider request-size, timeout, memory, CPU, and ephemeral-storage limits can
  be lower than the application's 100 MB product limit. Large or highly
  compressed TIFFs can therefore fail in hosted environments.
- Free hosting can sleep, cold-start, change limits, or be unavailable; check
  current provider terms before deployment.

## Repository structure

```text
Microscopy-TIFF-Explorer/
├── frontend/          # React, TypeScript, Vite
├── backend/           # FastAPI, tifffile, NumPy, Pillow
├── docs/              # requirements, architecture, roadmap
├── manual-test-data/  # small regression fixtures
├── render.yaml        # Render backend Blueprint
├── AGENTS.md
└── README.md
```
