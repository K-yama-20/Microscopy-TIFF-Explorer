# Microscopy TIFF Explorer — Requirements

## 1. Overview

### 1.1 Project Name

Microscopy TIFF Explorer

### 1.2 Purpose

Microscopy TIFF Explorer is a web application for inspecting and exporting microscopy TIFF images.

The application allows users to upload TIFF files, inspect their dimensional structure and metadata, select specific Channel / Z-stack / Time-point positions, preview the selected image plane, and export images as PNG files.

The MVP is intended primarily for researchers and students who handle microscopy images and need a lightweight browser-based tool for inspecting multidimensional TIFF files without dedicated desktop software.

## 2. Target Users

- Researchers working with microscopy images
- University students working with biological image data
- Users handling fluorescence or brightfield microscopy TIFF files
- Users who need to inspect multidimensional TIFF files quickly

The MVP does not require user registration or account management.

## 3. Primary Use Case

1. The user opens the web application.
2. The user uploads a `.tif` or `.tiff` file.
3. The backend analyzes the TIFF structure.
4. The application displays image metadata and dimensional information.
5. The user selects a Time point, Z slice, and Channel when available.
6. The selected image is displayed in the browser.
7. The user downloads the selected image as PNG.
8. The user may export multiple image planes as a ZIP archive.

## 4. MVP Scope

### 4.1 TIFF Upload

Supported file extensions:

- `.tif`
- `.tiff`

Maximum file size: 100 MB.

The frontend should reject files larger than the configured maximum before upload when possible. The backend must independently validate file type and size.

## 5. Supported TIFF Types

### 5.1 OME-TIFF

OME-TIFF is a primary supported microscopy format. When OME metadata is available, the application should use it to determine dimensional structure where possible.

### 5.2 ImageJ TIFF

ImageJ-compatible TIFF files should be supported when their structure can be correctly interpreted by the TIFF parsing library.

### 5.3 Standard TIFF

Standard TIFF files should be supported when their image structure can be reasonably interpreted. The application does not need to guarantee support for every TIFF variant. Unsupported or ambiguous files should return a clear error.

## 6. Supported Image Dimensions

The application should support these axis structures when detected:

- `YX`
- `ZYX`
- `CYX`
- `ZCYX`
- `TZCYX`

Other compatible axis combinations may be supported if they can be safely normalized internally.

- `T`: Time point
- `Z`: Z-stack position
- `C`: Channel
- `Y`: Image height
- `X`: Image width

The backend should rely on TIFF metadata whenever possible instead of guessing axis meaning solely from array shape.

## 7. Supported Bit Depth

The MVP must support unsigned 8-bit and 16-bit images (`uint8` and `uint16`). Unsupported data types should produce a clear validation error.

## 8. TIFF Analysis

After upload, the backend must inspect the TIFF and return at least:

- Filename
- Image shape
- Axis order
- Data type
- Image width and height
- Number of Channels
- Number of Z slices
- Number of Time points

Example:

```json
{
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

## 9. Metadata Display

The frontend must display the required TIFF information after successful analysis. If available, it may additionally show OME metadata presence, physical pixel size, and channel names.

## 10. Image Plane Selection

Show a Time, Z, or Channel selector only when the corresponding axis exists. The selector may use a dropdown, number input, or slider. Selection must remain in range and should default to index 0.

## 11. Image Preview

The selected image plane must be displayed in the browser and refreshed when Time, Z, or Channel changes. Browser preview does not need to preserve the original bit depth; reliable visualization takes priority.

## 12. 8-bit Image Handling

For 8-bit TIFF images, preserve pixel values under normal circumstances and convert directly to an 8-bit PNG for preview and export.

## 13. 16-bit Image Handling

16-bit images must be converted to 8-bit for browser preview. The default method uses the 1st and 99th percentiles:

```text
lower = percentile(image, 1)
upper = percentile(image, 99)
image_clipped = clip(image, lower, upper)
image_8bit = (image_clipped - lower) / (upper - lower) * 255
```

Clip the result to `0–255` and convert to `uint8`. If `upper == lower`, avoid division by zero and return a valid uniform image.

## 14. PNG Export

The user must be able to export the current plane as an 8-bit PNG. A 16-bit source must use the same normalization as preview. Filenames should retain useful source and dimension information, for example:

```text
sample_T000_Z012_C002.png
```

## 15. ZIP Export

The user must be able to export multiple image planes as a ZIP archive. A simple “Export Stack as ZIP” operation is acceptable for MVP v1. Each PNG in the archive should have a deterministic T/Z/C filename.

## 16. RGB TIFF Handling

The backend must not blindly treat every three-element dimension as a microscopy Channel axis. When metadata clearly indicates RGB, keep RGB samples grouped for normal preview when possible. Explicit RGB channel separation is outside MVP v1.

## 17. Error Handling

Display understandable errors rather than raw exceptions or stack traces. Required cases include:

- Unsupported extension
- File larger than 100 MB
- Unsupported data type
- Invalid or ambiguous TIFF structure
- Missing temporary file
- Invalid dimension index
- Unexpected processing error

Detailed internal errors may be logged, but must not be exposed to users.

## 18. File Storage Policy

The MVP must not permanently store microscopy files. Uploaded TIFFs and generated exports should exist only as long as needed for metadata inspection, previews, PNG generation, and ZIP generation. Temporary files should expire automatically.

## 19. Authentication

Authentication is not required for MVP v1. The app must work without account creation, login, passwords, or profiles.

## 20. Database

A database and Supabase are not required for MVP v1. User accounts, uploaded images, processing history, and export history are not stored persistently.

## 21. Frontend Requirements

Frontend technology: React and TypeScript.

The frontend should provide TIFF drag-and-drop or file selection, upload status, metadata, T/Z/C selectors, image preview, PNG download, ZIP export, and clear error messages. Modern desktop browsers are the priority.

## 22. Backend Requirements

Backend technology: Python and FastAPI. Core libraries may include `tifffile`, `numpy`, and `Pillow`.

The backend owns TIFF validation and parsing, metadata extraction, dimension handling, plane extraction, 16-bit normalization, PNG generation, ZIP generation, and temporary-file lifecycle. Large TIFF processing should not run directly in the browser for MVP v1.

## 23. Deployment

- Frontend: Vercel
- Backend: Render, Railway, Google Cloud Run, or another Python-compatible service

The final backend host may be selected during implementation.

## 24. Security and Privacy

- Do not intentionally retain uploads permanently.
- Do not expose uploads through predictable public URLs.
- Remove temporary files when no longer required or after expiration.
- Do not expose filesystem paths or sensitive implementation details.
- Tell users that files are processed temporarily.

## 25. Performance

Target file size is at most 100 MB. The MVP is not required to support multi-gigabyte whole-slide images, extremely large tiled pyramids, whole-slide pathology formats, or distributed processing.

## 26. Browser Support

Google Chrome, Microsoft Edge, and modern Chromium-based browsers are required. Firefox and Safari are desirable but not mandatory for MVP v1.

## 27. MVP Non-Goals

- User registration or authentication
- Supabase integration
- Persistent image storage or history
- Dataset and project management
- Annotation, segmentation, AI inference, or classification
- Image editing, drawing, measurements, or scale bars
- Collaboration, sharing, permissions, or multi-user workspaces
- Whole-slide imaging, DICOM, or proprietary formats such as `.czi`, `.lif`, and `.nd2`

## 28. Future Expansion Candidates

Potential future work includes manual intensity windowing, adjustable normalization, gamma and contrast controls, projections, Z-stack animation, richer OME metadata, channel pseudo-coloring, scale bars, accounts, datasets, cloud storage, annotation, and AI workflows.

## 29. Definition of MVP Completion

MVP v1 is complete when a user can:

1. Open the deployed application.
2. Upload a supported TIFF smaller than 100 MB.
3. View dimensions and basic metadata.
4. Select available Time / Z / Channel positions.
5. Preview the selected plane.
6. Correctly preview 8-bit and 16-bit images.
7. Download the selected plane as an 8-bit PNG.
8. Export multiple planes as ZIP.
9. Receive understandable errors for unsupported or invalid files.
10. Use the application without logging in.
11. Trust that uploads are not intentionally stored permanently.

## 30. Product Principle

> Upload a microscopy TIFF, understand its structure, inspect the desired image plane, and export it with as little friction as possible.

Features that do not directly contribute to this workflow should generally wait until after the MVP.

