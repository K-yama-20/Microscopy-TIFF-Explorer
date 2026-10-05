# Microscopy TIFF Explorer — Roadmap

## Goal

Complete an MVP that lets a user upload a supported TIFF, inspect metadata, select T/Z/C dimensions and RGB Color components when applicable, preview the selected plane, export PNG and ZIP files, and use the application through a public URL. After MVP v1, extend the same workflow with an ordered image-selection tray and a temporary multi-TIFF workspace without introducing accounts or permanent projects.

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

## Step 11 — Single-TIFF Selection Tray

### Goal

Let the user pin several immutable planes from one TIFF while continuing to use
one clear active preview.

### Main Tasks

- Introduce an ordered `PinnedSelection` model containing `file_id`, T/Z/C,
  RGB component, and addition order.
- Add an **Add to selection** action for the current preview.
- Prevent exact duplicates identified by file/T/Z/C/component.
- Add a selected-images tray with source filename, coordinate/component labels,
  thumbnail, individual removal, clear-all, and individual PNG download.
- Make a thumbnail click restore its file and coordinates to the active preview.
- Keep pinned selections immutable when active selectors change.
- Add optional `max_size` support to the preview endpoint without changing the
  existing default response.
- Request thumbnails with a maximum edge of 240 pixels and release every object
  URL when no longer needed.
- Keep the current **Download PNG** and **Export Stack as ZIP** behavior intact.

### Acceptance Criteria

- A user can pin multiple planes from one TIFF and continue browsing other
  T/Z/C/component positions.
- The UI shows one full-size active preview and an ordered thumbnail tray.
- Clicking a thumbnail restores the exact selection without removing it.
- An exact duplicate cannot be added, while different RGB component modes at
  the same T/Z/C position can be added.
- Pinned items can be downloaded individually, removed, or cleared.
- Thumbnail resizing never changes exported image resolution or normalization.
- Existing preview, PNG, and full-stack ZIP tests continue to pass.

## Step 12 — Selected-Image ZIP Export

### Goal

Export only the pinned images as one atomic, traceable ZIP archive.

### Main Tasks

- Implement `POST /api/exports/selection` with a list of
  `file_id`/T/Z/C/component items.
- Design the request for multiple `file_id` values from the beginning, even
  while the Step 12 UI initially uses one source TIFF.
- Reject empty requests, exact duplicates, and requests above configured limits.
- Validate every source, coordinate, and component before returning success.
- Reuse shared extraction, canonicalization, normalization, PNG encoding, and
  filename sanitation.
- Load each source series once and render all requested selections for it.
- Create a source folder even for a single-file selection ZIP.
- Add `manifest.csv` with archive path, source filename, T/Z/C, and component in
  pinned addition order.
- Escape untrusted CSV values and exclude server paths and storage identifiers.
- Add **Download selected (N) as ZIP** with processing, abort, and error states.
- Close spooled archive data on success, failure, and interrupted delivery.

### Acceptance Criteria

- The ZIP contains exactly the pinned images in their addition order.
- Every PNG matches the existing preview/PNG rendering contract.
- The archive has deterministic safe paths and a complete `manifest.csv`.
- A bad or expired item fails the entire request; partial archives are never
  returned as successful.
- Empty, duplicate, limit, missing-file, invalid-index, invalid-component, and
  processing errors use the structured error envelope.
- Browser downloads clean up temporary anchors, object URLs, and aborted work.

## Step 13 — Multi-TIFF Workspace

### Goal

Allow up to three temporary TIFF sources to coexist while preserving the
selection-tray behavior from Steps 11–12.

### Main Tasks

- Replace the single upload result state with an ordered `WorkspaceFile` list.
- Add a file list and **Add TIFF** action without clearing valid existing files.
- Maintain one active file and a separate last active T/Z/C/component selection
  for each file.
- Default every new file to T=0, Z=0, C=0, and composite.
- Keep upload failure isolated to the attempted file.
- Permit equal source filenames and add display-only `(2)`, `(3)` suffixes.
- Keep one shared pinned-selection tray spanning all active files.
- Make a pinned-item click activate the correct source before restoring its
  selection.
- Confirm removal when a source has pinned items, then remove only that source
  and its dependent selections.
- Add idempotent `DELETE /api/tiff/{file_id}` for eager cleanup while retaining
  TTL cleanup as fallback.
- Do not restore workspace state after reload or write file IDs to localStorage.

### Acceptance Criteria

- Adding a second or third TIFF leaves earlier files and selections intact.
- Switching files restores each file's last selector state.
- Same-name files remain distinct and understandable in the UI.
- Selections from all files appear in one ordered tray.
- Removing one file affects only that file and its pinned items.
- A failed upload or expired file does not clear other valid workspace sources.
- The existing one-file workflow remains simple and fully functional.

## Step 14 — Multi-File Export, Limits, and Lifecycle

### Goal

Complete safe multi-file batch export and adapt temporary-file lifecycle rules
to a longer interactive workspace.

### Main Tasks

- Extend the selected-export UI to send selections from multiple sources using
  the Step 12 API without replacing its contract.
- Group archive entries into numbered, sanitized source folders based on first
  request appearance.
- Acquire all referenced upload leases safely, process one TIFF array at a time,
  and release large arrays before loading the next source.
- Enforce defaults of 3 active/distinct files, 200 MB combined source size, and
  50 pinned/exported images in backend and frontend.
- Change cleanup to 30 minutes since successful use with a two-hour absolute
  lifetime from upload.
- Track `created_at` and `last_accessed_at`; never extend the absolute deadline.
- Preserve lease safety, startup orphan cleanup, and structured missing-file
  behavior across hosting restarts.
- Add clear inactivity and absolute-lifetime messaging to the UI.
- Complete multi-file RGB, filename collision, manifest, concurrency, cleanup,
  and regression tests.

### Acceptance Criteria

- One ZIP can contain selected planes from up to three TIFFs with no path or
  filename collision.
- The archive contains no more than 50 requested PNGs and the sources total no
  more than 200 MB.
- Each source is loaded once per export and multiple full TIFF arrays are not
  retained simultaneously.
- `C` and RGB `S` remain independent for every source.
- Activity extends the inactivity deadline, but no source survives beyond two
  hours from upload.
- Concurrent cleanup cannot delete an actively rendered source.
- Expired or restarted-away sources fail safely without corrupting other
  workspace state.
- All Steps 1–13 regression tests remain green.

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

Post-MVP v2 should be delivered as four focused increments rather than one
large change:

```text
Increment 1: Step 11 — selection state and thumbnails
Increment 2: Step 12 — selected-image ZIP API and UI
Increment 3: Step 13 — multi-file workspace
Increment 4: Step 14 — multi-file lifecycle, limits, and regression hardening
```

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
feature/011-selection-tray
feature/012-selection-export
feature/013-multi-file-workspace
feature/014-workspace-lifecycle
```

## MVP Priority

- P0: TIFF upload, metadata parsing, T/Z/C selection, preview, 16-bit normalization, PNG export
- P1: ZIP export, temporary-file cleanup, error polish
- P2: visual polish, additional metadata, optional deletion endpoint

Post-MVP v2 priorities:

- P0: immutable selection tray and selected-image ZIP export
- P1: multi-file workspace, eager removal, multi-file export, and enforced limits
- P1: inactivity plus absolute lifetime cleanup and multi-source lease safety
- P2: thumbnail performance polish and richer workspace status messaging

The MVP should not be delayed for features outside P0 unless they are required for safe public deployment.

