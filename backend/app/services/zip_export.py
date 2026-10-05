import tempfile
from collections.abc import Iterator
from pathlib import Path
from typing import BinaryIO
from zipfile import ZIP_DEFLATED, ZipFile

import tifffile

from app.services.export_filenames import build_png_export_filename
from app.services.plane_extraction import RgbComponent, validate_plane_selection
from app.services.plane_rendering import render_array_plane_png

ZIP_SPOOL_LIMIT_BYTES = 8 * 1024 * 1024
ZIP_STREAM_CHUNK_SIZE_BYTES = 1024 * 1024


def _axis_count(shape: tuple[int, ...], axes: str, axis: str) -> int:
    return int(shape[axes.index(axis)]) if axis in axes else 1


def iter_tzc_indices(
    shape: tuple[int, ...], axes: str
) -> Iterator[tuple[int, int, int]]:
    """Yield every semantic T/Z/C position in deterministic T, Z, C order."""
    for t in range(_axis_count(shape, axes, "T")):
        for z in range(_axis_count(shape, axes, "Z")):
            for c in range(_axis_count(shape, axes, "C")):
                yield t, z, c


def build_tiff_zip_archive(
    path: Path,
    source_filename: str,
    *,
    component: str = "composite",
) -> tuple[BinaryIO, RgbComponent, bool]:
    """Render all T/Z/C planes into a temporary, seekable ZIP archive."""
    # Ownership transfers to the response streamer when archive creation succeeds.
    archive = tempfile.SpooledTemporaryFile(  # noqa: SIM115
        max_size=ZIP_SPOOL_LIMIT_BYTES,
        mode="w+b",
    )
    try:
        with tifffile.TiffFile(path) as tif:
            if not tif.series:
                raise ValueError("TIFF does not contain an image series")

            series = tif.series[0]
            axes = series.axes or ""
            shape = tuple(int(size) for size in series.shape)
            selected_component = validate_plane_selection(
                shape,
                axes,
                component=component,
            )
            array = series.asarray()

        is_rgb = "S" in axes
        with ZipFile(archive, mode="w", compression=ZIP_DEFLATED) as zip_file:
            for t, z, c in iter_tzc_indices(shape, axes):
                rendered = render_array_plane_png(
                    array,
                    axes,
                    t=t,
                    z=z,
                    c=c,
                    component=selected_component,
                )
                entry_name = build_png_export_filename(
                    source_filename,
                    t=t,
                    z=z,
                    c=c,
                    component=selected_component,
                    is_rgb=is_rgb,
                )
                zip_file.writestr(entry_name, rendered.content)

        archive.seek(0)
        return archive, selected_component, is_rgb
    except Exception:
        archive.close()
        raise


def stream_archive(archive: BinaryIO) -> Iterator[bytes]:
    """Stream a temporary archive and close it even if response delivery stops."""
    try:
        while chunk := archive.read(ZIP_STREAM_CHUNK_SIZE_BYTES):
            yield chunk
    finally:
        archive.close()
