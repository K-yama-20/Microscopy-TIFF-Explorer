# Microscopy TIFF Explorer — Roadmap

## Goal

Complete an MVP that lets a user upload a supported TIFF, inspect metadata, select T/Z/C dimensions and RGB Color components when applicable, preview the selected plane, export PNG and ZIP files, and use the application through a public URL.

## Step 1 — Project Foundation

### Goal

Create the basic frontend/backend project structure and confirm both applications run locally.

### Main Tasks

Frontend:

- Create a React + TypeScript + Vite project.
- Create an initial application layout and global styles.
- Prepare the frontend directory structure.

Backend:

- Create a Python FastAPI application.
- Add FastAPI, Uvicorn, tifffile, NumPy, Pillow, and python-multipart.
- Prepare the backend directory structure.
- Add `GET /health` returning `{"status":"ok"}`.

Repository:

- Add `.gitignore`, `README.md`, and the `docs/` documents.

### Acceptance Criteria

- Frontend starts at `http://localhost:5173`.
- Backend starts at `http://localhost:8000`.
- The health endpoint returns a successful response.
- The repository contains the agreed project structure.

## Step 2 — TIFF Upload UI and Validation

### Goal

Allow users to select or drag-and-drop TIFF files in the browser.

### Main Tasks

- Add a file input and drag-and-drop area.
- Display the selected filename and file size.
- Accept `.tif` and `.tiff` only.
- Reject files larger than 100 MB before upload.
- Add an upload button and reset/replace behavior.
- Display clear validation messages.

### Acceptance Criteria

- Users can choose or drag and drop a TIFF file.
- Invalid extensions are rejected.
- Files larger than 100 MB are rejected.
- A valid TIFF can proceed to upload.

## Step 3 — TIFF Upload API and Temporary File Management

### Goal

Upload TIFF files to FastAPI and store them temporarily using safe server-generated identifiers.

### Main Tasks

- Implement `POST /api/tiff/upload` for multipart uploads.
- Independently validate extension and file size.
- Generate a UUID `file_id`.
- Save the upload under a server-controlled temporary path.
- Preserve the original filename as metadata only.
- Prevent user-controlled filesystem paths.
- Return structured errors and an initial upload response.

### Acceptance Criteria

- The frontend can upload a TIFF to the backend.
- The backend assigns a UUID and creates a temporary file.
- Invalid uploads return structured errors.
- The original filename is never used directly as a storage path.

## Step 4 — TIFF Metadata Parsing

### Goal

Analyze uploaded TIFF files and return their image structure.

### Main Tasks

- Parse the primary series with `tifffile.TiffFile`.
- Extract filename, shape, axes, dtype, width, height, T count, Z count, C count, and series count where practical.
- Support at least `YX`, `ZYX`, `CYX`, `ZCYX`, and `TZCYX`.
- Prefer file metadata over shape-only inference.
- Handle invalid TIFF, unsupported dtype, and ambiguous axes.
- Display returned metadata in the frontend.

### Acceptance Criteria

- A valid TIFF returns normalized metadata.
- `uint8` and `uint16` are recognized.
- Required MVP axis structures are correctly recognized.
- Metadata is visible in the frontend for a test TIFF.

## Step 5 — Metadata Panel and T / Z / C Selectors

### Goal

Display TIFF information and let the user select a specific image plane.

### Main Tasks

- Build a metadata panel.
- Add Time, Z, and Channel selectors.
- Show a selector only when its dimension exists.
- Default available dimension selections to index 0.
- Maintain `fileId`, `metadata`, `selectedT`, `selectedZ`, and `selectedC` state.
- Reset selections when a new file is uploaded.

### Acceptance Criteria

- Metadata appears after upload.
- T/Z/C selectors appear only for present axes.
- Selected indices always stay in range.
- Uploading a new file resets dimension selections.

## Step 6 — Image Plane Extraction and Preview API

### Goal

Extract the selected plane and show it in the browser.

### Main Tasks

- Implement semantic, axis-aware plane extraction.
- Extend metadata parsing to accept metadata-confirmed RGB `S` axes without treating them as microscopy Channels.
- Add backward-compatible `is_rgb`, `sample_count`, and `rgb_components` metadata fields while retaining every existing upload response field.
- Implement `GET /api/tiff/{file_id}/preview?t=&z=&c=&component=` with `component=composite` as the default.
- Return `image/png`.
- Request a preview after upload and whenever T/Z/C changes.
- Add a separate Color component selector for RGB composite / Red / Green / Blue and refresh the preview when it changes.
- Add loading and processing-error states.
- Keep RGB samples grouped for composite output and return individual components as grayscale without conflating `S` and `C`.

### Acceptance Criteria

- The selected plane is extracted correctly.
- Changing T/Z/C changes the preview.
- Existing non-RGB YX/ZYX/CYX/ZCYX/TZCYX behavior remains unchanged.
- Metadata-confirmed RGB TIFFs such as YXS upload successfully and default to a color composite preview.
- Red, Green, and Blue selections return the matching grayscale component.
- TIFFs containing both C and S keep Channel and Color component selections independent.
- Invalid indices return clear errors.
- Invalid RGB component selections return a structured error.

## Step 7 — 8-bit / 16-bit Normalization

### Goal

Make preview reliable for both 8-bit and 16-bit microscopy images.

### Main Tasks

- Create an isolated `normalize_to_uint8(image)` utility.
- Preserve `uint8` values.
- Normalize `uint16` using 1st/99th percentile clipping and conversion to `uint8`.
- Use shared bounds across a composite RGB array and component-specific bounds for an isolated R/G/B plane.
- Handle `upper == lower` without division by zero.
- Test grayscale and RGB `uint8`, normal `uint16`, constant `uint16`, high-dynamic-range `uint16`, and isolated component data.

### Acceptance Criteria

- 8-bit TIFF previews correctly.
- 16-bit TIFF previews correctly.
- Composite and separated RGB output preserve the documented normalization behavior.
- Constant images do not crash.
- Normalization logic is isolated and unit-tested.

## Step 8 — PNG Export

### Goal

Allow users to download the current image plane as PNG.

### Main Tasks

- Implement `GET /api/tiff/{file_id}/export/png?t=&z=&c=&component=` while keeping `component` optional and defaulting to composite.
- Extract the selected plane and use the same normalization as preview.
- Return a PNG with download-friendly headers.
- Use filenames such as `sample_T000_Z012_C002.png`, `sample_T000_Z012_C002_RGB.png`, and `sample_T000_Z012_C002_R.png`.
- Add a “Download PNG” button without changing current selection.

### Acceptance Criteria

- The current preview plane downloads as PNG.
- The filename contains useful T/Z/C information.
- RGB composite and separated component filenames are distinguishable and do not collide.
- `uint8` and `uint16` sources both export successfully.

## Step 9 — ZIP Batch Export

### Goal

Allow multiple image planes to be exported together.

### Main Tasks

- Implement `GET /api/tiff/{file_id}/export/zip?component=` with composite as the backward-compatible default.
- For MVP, export all planes across available T/Z/C dimensions.
- For RGB TIFFs, export the currently selected composite or R/G/B component across all T/Z/C positions without changing Channel semantics.
- Generate deterministically named PNG files with Python `zipfile`.
- Add an “Export Stack as ZIP” button and processing state.
- Avoid permanent ZIP storage.

### Acceptance Criteria

- A multi-plane TIFF produces a ZIP.
- The ZIP contains correctly named PNG files.
- The download works through the browser.
- RGB component suffixes prevent collisions, and omitted component selection exports composite images.
- Generated data remains temporary.

## Step 10 — Error Handling, Cleanup, UI Polish, and Deployment

### Goal

Turn the prototype into a usable public MVP.

### Main Tasks

- Standardize the error envelope and required error codes.
- Add automatic temporary-file expiration with an initial 30-minute TTL.
- Optionally add `DELETE /api/tiff/{file_id}` for eager cleanup.
- Improve layout, loading, error, empty, button, preview, and file-information states.
- Deploy the frontend to Vercel.
- Deploy the backend to Render, Railway, Google Cloud Run, or an equivalent service.
- Configure `VITE_API_BASE_URL`, `ALLOWED_ORIGINS`, `MAX_UPLOAD_SIZE_MB`, and `TEMP_FILE_TTL_MINUTES`.
- Verify production CORS.
- Complete README setup, feature, architecture, limitations, and deployment documentation.

### Acceptance Criteria

- The public application supports the complete upload → metadata → T/Z/C and optional RGB component → preview → PNG/ZIP workflow.
- 8-bit and 16-bit TIFFs work.
- RGB composite and Red / Green / Blue component workflows work end to end without treating samples as microscopy Channels.
- Errors are understandable and do not expose internals.
- Uploaded TIFFs and generated artifacts expire rather than being retained permanently.
- Production frontend/backend communication and CORS work.
- README documents the application and local setup.

### Implementation Status

Error contracts, 30-minute request-time TTL cleanup, in-use file leases,
startup orphan cleanup, UI/accessibility polish, regression tests, README
documentation, a Render Blueprint, and Vercel build configuration are
implemented on the Step 10 feature branch. Local quality checks must pass before
merge. Public deployment and production CORS/workflow verification remain
pending until the branch is reviewed, committed, pushed, and linked to uniquely
identified provider projects without paid resources.

## Suggested One-Week Schedule

```text
Day 1: Steps 1–2
Day 2: Steps 3–4
Day 3: Steps 5–6
Day 4: Steps 7–8
Day 5: Step 9
Day 6: Step 10, deployment, bug fixes
Day 7: Real TIFF testing, screenshots, README, portfolio polish
```

If time is limited, prioritize Upload → Metadata → T/Z/C selection → Preview → PNG export → Deployment. ZIP export and visual polish may be reduced before compromising the core workflow.

## Development Rule

Each step should normally correspond to one GitHub Issue and one focused feature branch:

```text
feature/001-project-foundation
feature/002-tiff-upload-ui
feature/003-upload-api
feature/004-metadata-parser
feature/005-dimension-selectors
feature/006-image-preview
feature/007-normalization
feature/008-png-export
feature/009-zip-export
feature/010-deploy-polish
```

## MVP Priority

- P0: TIFF upload, metadata parsing, T/Z/C selection, preview, 16-bit normalization, PNG export
- P1: ZIP export, temporary-file cleanup, error polish
- P2: visual polish, additional metadata, optional deletion endpoint

The MVP should not be delayed for features outside P0 unless they are required for safe public deployment.

