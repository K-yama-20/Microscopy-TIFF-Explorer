import re
from pathlib import PurePosixPath

from app.services.plane_extraction import RgbComponent

_TIFF_EXTENSION = re.compile(r"(?i)\.tiff?$")
_UNSAFE_FILENAME_CHARACTERS = re.compile(r"[^A-Za-z0-9._-]+")


def _safe_source_basename(source_filename: str) -> str:
    client_basename = PurePosixPath(source_filename.replace("\\", "/")).name
    without_extension = _TIFF_EXTENSION.sub("", client_basename)
    safe_basename = _UNSAFE_FILENAME_CHARACTERS.sub("_", without_extension)
    while ".." in safe_basename:
        safe_basename = safe_basename.replace("..", "_")
    return safe_basename.strip("._-")[:120] or "image"


def build_png_export_filename(
    source_filename: str,
    *,
    t: int,
    z: int,
    c: int,
    component: RgbComponent,
    is_rgb: bool,
) -> str:
    """Build a deterministic ASCII filename safe for Content-Disposition."""
    safe_basename = _safe_source_basename(source_filename)

    suffix = ""
    if is_rgb:
        suffix = {
            RgbComponent.COMPOSITE: "_RGB",
            RgbComponent.RED: "_R",
            RgbComponent.GREEN: "_G",
            RgbComponent.BLUE: "_B",
        }[component]

    return f"{safe_basename}_T{t:03d}_Z{z:03d}_C{c:03d}{suffix}.png"


def build_zip_export_filename(
    source_filename: str,
    *,
    component: RgbComponent,
    is_rgb: bool,
) -> str:
    """Build a safe archive filename that distinguishes RGB component modes."""
    safe_basename = _safe_source_basename(source_filename)
    suffix = ""
    if is_rgb:
        suffix = {
            RgbComponent.COMPOSITE: "_RGB",
            RgbComponent.RED: "_R",
            RgbComponent.GREEN: "_G",
            RgbComponent.BLUE: "_B",
        }[component]

    return f"{safe_basename}_stack{suffix}.zip"
