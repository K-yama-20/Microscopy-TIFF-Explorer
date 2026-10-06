import csv
import tempfile
from collections import defaultdict
from contextlib import ExitStack
from dataclasses import dataclass
from io import StringIO
from pathlib import PurePosixPath
from typing import BinaryIO
from uuid import UUID
from zipfile import ZIP_DEFLATED, ZipFile

import tifffile

from app.models.errors import (
    BatchLimitExceededError,
    DuplicateSelectionError,
    EmptySelectionError,
    FileNotFoundError,
)
from app.models.selection_export import SelectionExportItem
from app.services.export_filenames import (
    build_png_export_filename,
    safe_source_basename,
)
from app.services.plane_extraction import RgbComponent, validate_plane_selection
from app.services.plane_rendering import render_array_plane_png
from app.services.temporary_files import TemporaryFileManager, TemporaryUpload
from app.services.zip_export import ZIP_SPOOL_LIMIT_BYTES

MAX_SELECTION_ITEMS = 50
MAX_SELECTION_FILES = 3
MAX_SELECTION_SOURCE_BYTES = 200 * 1024 * 1024
SELECTION_ARCHIVE_FILENAME = "microscopy-selection.zip"
MANIFEST_COLUMNS = (
    "archive_path",
    "source_filename",
    "t",
    "z",
    "c",
    "component",
)


@dataclass(frozen=True, slots=True)
class ParsedSelectionItem:
    file_id: UUID
    t: int
    z: int
    c: int
    component: str


@dataclass(frozen=True, slots=True)
class RenderedSelection:
    archive_path: str
    source_filename: str
    t: int
    z: int
    c: int
    component: RgbComponent
    content: bytes


def _parse_items(items: list[SelectionExportItem]) -> list[ParsedSelectionItem]:
    if not items:
        raise EmptySelectionError
    if len(items) > MAX_SELECTION_ITEMS:
        raise BatchLimitExceededError

    raw_keys = [
        (item.file_id, item.t, item.z, item.c, item.component) for item in items
    ]
    if len(raw_keys) != len(set(raw_keys)):
        raise DuplicateSelectionError

    parsed: list[ParsedSelectionItem] = []
    try:
        for item in items:
            parsed.append(
                ParsedSelectionItem(
                    file_id=UUID(item.file_id),
                    t=item.t,
                    z=item.z,
                    c=item.c,
                    component=item.component,
                )
            )
    except ValueError:
        raise FileNotFoundError from None

    canonical_keys = [
        (item.file_id, item.t, item.z, item.c, item.component) for item in parsed
    ]
    if len(canonical_keys) != len(set(canonical_keys)):
        raise DuplicateSelectionError
    if len({item.file_id for item in parsed}) > MAX_SELECTION_FILES:
        raise BatchLimitExceededError
    return parsed


def _formula_safe(value: str) -> str:
    if value.lstrip().startswith(("=", "+", "-", "@")):
        return f"'{value}"
    return value


def _build_manifest(rows: list[RenderedSelection]) -> str:
    output = StringIO(newline="")
    writer = csv.writer(output, lineterminator="\n")
    writer.writerow(MANIFEST_COLUMNS)
    for row in rows:
        writer.writerow(
            (
                row.archive_path,
                _formula_safe(row.source_filename),
                row.t,
                row.z,
                row.c,
                row.component.value,
            )
        )
    return output.getvalue()


def _source_order(items: list[ParsedSelectionItem]) -> list[UUID]:
    return list(dict.fromkeys(item.file_id for item in items))


def _build_folder_names(
    source_order: list[UUID], uploads: dict[UUID, TemporaryUpload]
) -> dict[UUID, str]:
    return {
        file_id: f"{position:02d}_{safe_source_basename(uploads[file_id].filename)}"
        for position, file_id in enumerate(source_order, start=1)
    }


def _validate_archive_path(path: str) -> None:
    parsed = PurePosixPath(path)
    if parsed.is_absolute() or ".." in parsed.parts or len(parsed.parts) != 2:
        raise ValueError("Unsafe generated archive path")


def build_selection_zip_archive(
    manager: TemporaryFileManager,
    request_items: list[SelectionExportItem],
) -> BinaryIO:
    """Build a complete selected-image archive before returning its stream."""
    items = _parse_items(request_items)
    source_order = _source_order(items)
    grouped_indices: dict[UUID, list[int]] = defaultdict(list)
    for index, item in enumerate(items):
        grouped_indices[item.file_id].append(index)

    archive: BinaryIO | None = None
    with ExitStack() as leases:
        uploads: dict[UUID, TemporaryUpload] = {}
        for file_id in sorted(source_order, key=lambda value: value.int):
            upload = leases.enter_context(manager.acquire(file_id))
            if upload is None or not upload.path.is_file():
                raise FileNotFoundError
            uploads[file_id] = upload

        if sum(upload.size_bytes for upload in uploads.values()) > (
            MAX_SELECTION_SOURCE_BYTES
        ):
            raise BatchLimitExceededError

        folders = _build_folder_names(source_order, uploads)
        rendered: list[RenderedSelection | None] = [None] * len(items)
        archive = tempfile.SpooledTemporaryFile(  # noqa: SIM115
            max_size=ZIP_SPOOL_LIMIT_BYTES,
            mode="w+b",
        )
        try:
            for file_id in source_order:
                upload = uploads[file_id]
                with tifffile.TiffFile(upload.path) as tif:
                    if not tif.series:
                        raise ValueError("TIFF does not contain an image series")
                    series = tif.series[0]
                    axes = series.axes or ""
                    shape = tuple(int(size) for size in series.shape)
                    selections: list[tuple[int, ParsedSelectionItem, RgbComponent]] = []
                    for index in grouped_indices[file_id]:
                        item = items[index]
                        component = validate_plane_selection(
                            shape,
                            axes,
                            t=item.t,
                            z=item.z,
                            c=item.c,
                            component=item.component,
                        )
                        selections.append((index, item, component))

                    array = series.asarray()

                is_rgb = "S" in axes
                for index, item, component in selections:
                    png = render_array_plane_png(
                        array,
                        axes,
                        t=item.t,
                        z=item.z,
                        c=item.c,
                        component=component,
                    )
                    filename = build_png_export_filename(
                        upload.filename,
                        t=item.t,
                        z=item.z,
                        c=item.c,
                        component=component,
                        is_rgb=is_rgb,
                    )
                    archive_path = f"{folders[file_id]}/{filename}"
                    _validate_archive_path(archive_path)
                    rendered[index] = RenderedSelection(
                        archive_path=archive_path,
                        source_filename=upload.filename,
                        t=item.t,
                        z=item.z,
                        c=item.c,
                        component=component,
                        content=png.content,
                    )

                del array

            completed = [row for row in rendered if row is not None]
            if len(completed) != len(items):
                raise RuntimeError("Selection rendering did not complete")
            archive_paths = [row.archive_path for row in completed]
            if len(archive_paths) != len(set(archive_paths)):
                raise DuplicateSelectionError

            with ZipFile(archive, mode="w", compression=ZIP_DEFLATED) as zip_file:
                for row in completed:
                    zip_file.writestr(row.archive_path, row.content)
                zip_file.writestr("manifest.csv", _build_manifest(completed))

            archive.seek(0)
            return archive
        except Exception:
            archive.close()
            raise
