# UI Layout Redesign Plan

## Status

Implemented. The layout described below is the specification used for the
frontend update.

## Goal

Reorganize the application so its purpose is explained at the top of the page
and the TIFF workspace appears below it. Preserve the existing visual identity
while making the initial upload flow and the post-upload workspace easier to
scan and use.

## Decisions

- Remove the `STEP 1 OF 3` label. The application is a continuous workspace,
  not a three-page wizard, so the label is misleading.
- Replace it with a neutral workspace label such as `TIFF WORKSPACE`.
- Place the introductory content above the TIFF workspace instead of beside it.
- Do not show a `30-minute automatic deletion` message in the introductory
  area.
- Keep the existing temporary-processing explanation near the upload controls
  where it is directly relevant.
- Preserve the current color palette, serif display heading, typography style,
  focus treatment, and component language.
- Do not change backend behavior, API contracts, TIFF processing, or TTL logic.

## Proposed Initial Layout

```text
┌──────────────────────────────────────────────────────────────┐
│ Header                              Microscopy TIFF Explorer │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│ BROWSER-BASED MICROSCOPY WORKFLOW                            │
│ Explore microscopy TIFF files with clarity.                  │
│                                                              │
│ Inspect metadata and image planes, then export PNG or ZIP.   │
│                                                              │
│ [TIFF files] [Up to 100 MB]                                  │
│                                                              │
├──────────────────────────────────────────────────────────────┤
│                        TIFF WORKSPACE                        │
│                  Upload a microscopy TIFF                   │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐  │
│  │                                                        │  │
│  │              Drag and drop a TIFF                     │  │
│  │                 or browse files                       │  │
│  │                                                        │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                              │
│                       Reset  Upload TIFF                     │
└──────────────────────────────────────────────────────────────┘
```

The introduction should be concise and readable at normal browser zoom. The
workspace should be centered, wider than the current right-side card, and
visually separated from the explanatory content.

## Proposed Post-Upload Layout

```text
┌──────────────────────────────────────────────────────────────┐
│ Introductory content                                         │
├──────────────────────────────────────────────────────────────┤
│ Upload complete                                              │
│                                                              │
│ ┌──────────────────────────┐ ┌─────────────────────────────┐ │
│ │ TIFF metadata            │ │ Image preview               │ │
│ │ Shape / axes / dtype     │ │                             │ │
│ │ RGB and sample details   │ │       Contained image       │ │
│ ├──────────────────────────┤ │                             │ │
│ │ View controls            │ └─────────────────────────────┘ │
│ │ T / Z / Channel          │ ┌─────────────────────────────┐ │
│ │ RGB color component      │ │ PNG and ZIP export          │ │
│ └──────────────────────────┘ └─────────────────────────────┘ │
└──────────────────────────────────────────────────────────────┘
```

On desktop, metadata and selectors form the left column while preview and
export form the wider right column. On small screens, all sections stack in a
single logical order: metadata, selectors, preview, then export.

## Planned File Changes

### `frontend/src/App.tsx`

- Change the main page from a left/right composition to a top/bottom flow.
- Keep the eyebrow and main heading, but reduce the heading size enough to avoid
  an oversized multi-line block.
- Shorten the supporting copy to describe metadata inspection, plane preview,
  PNG download, and ZIP export.
- Replace the current status card with small, factual capability badges such as
  `TIFF files` and `Up to 100 MB`.
- Do not add a TTL or automatic-deletion badge.

### `frontend/src/components/TiffUpload.tsx`

- Remove `STEP 1 OF 3`.
- Add the neutral `TIFF WORKSPACE` label.
- Use a clearer heading such as `Upload a microscopy TIFF`.
- Preserve all upload, validation, reset, replacement, selector, preview, and
  export behavior.
- Organize the successful-upload state into a responsive workspace grid.

### `frontend/src/styles/global.css`

- Change `.main-content` to a single-column top/bottom layout.
- Constrain and center the introductory content for comfortable reading.
- Make the upload workspace wider and horizontally centered.
- Adjust spacing, typography, and maximum widths for large displays.
- Add a two-column post-upload workspace at desktop widths.
- Collapse the workspace to one column without horizontal overflow on small
  screens.
- Retain visible focus styles and `prefers-reduced-motion` behavior.

### `frontend/src/components/TiffUpload.test.tsx`

- Update assertions affected by the heading and label changes.
- Verify the misleading step label is absent and the workspace label is present.
- Keep all existing behavior tests for upload, selection resets, request aborts,
  preview, PNG, ZIP, RGB handling, errors, and object URL cleanup.

## Accessibility Requirements

- Preserve associated labels for file input and all selectors.
- Preserve keyboard activation for file selection and action buttons.
- Preserve `role="status"`, `role="alert"`, `aria-live`, and `aria-busy`
  behavior.
- Keep visible focus indicators.
- Maintain a logical DOM and tab order when the desktop grid collapses.
- Do not communicate state by color alone.

## Acceptance Criteria

- The introductory text appears above the TIFF workspace on desktop and mobile.
- `STEP 1 OF 3` is no longer displayed.
- The introductory area does not mention 30-minute automatic deletion.
- The initial upload workspace is centered, wider, and easier to scan.
- The main heading and supporting copy remain readable without dominating the
  page.
- After upload, metadata/selectors and preview/export use a clear desktop grid.
- Small screens use a single-column layout without horizontal overflow.
- Existing upload, metadata, T/Z/C, RGB component, preview, PNG, and ZIP behavior
  remains unchanged.
- Existing accessibility semantics and request-cancellation behavior remain
  intact.
- Frontend formatting, linting, tests, and production build pass.

## Out of Scope

- Backend or API changes
- Changes to TTL behavior
- New UI frameworks or component libraries
- Authentication, persistence, or database features
- Changes to TIFF parsing, normalization, preview, PNG, or ZIP logic
