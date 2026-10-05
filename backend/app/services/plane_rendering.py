from dataclasses import dataclass
from pathlib import Path

import numpy as np
import tifffile

from app.services.normalization import normalize_to_uint8
from app.services.plane_extraction import (
    RgbComponent,
    extract_plane,
    validate_plane_selection,
)
from app.services.png_encoding import encode_png


@dataclass(frozen=True, slots=True)
class RenderedPng:
    content: bytes
    component: RgbComponent
    is_rgb: bool


def render_array_plane_png(
    array: np.ndarray,
    axes: str,
    *,
    t: int = 0,
    z: int = 0,
    c: int = 0,
    component: RgbComponent | str = RgbComponent.COMPOSITE,
) -> RenderedPng:
    """Render one plane from an already loaded primary-series array."""
    plane = extract_plane(
        array,
        axes,
        t=t,
        z=z,
        c=c,
        component=component,
    )
    normalized = normalize_to_uint8(plane)
    selected_component = (
        component
        if isinstance(component, RgbComponent)
        else validate_plane_selection(
            array.shape,
            axes,
            t=t,
            z=z,
            c=c,
            component=component,
        )
    )
    return RenderedPng(
        content=encode_png(normalized),
        component=selected_component,
        is_rgb="S" in axes,
    )


def render_tiff_plane_png(
    path: Path,
    *,
    t: int = 0,
    z: int = 0,
    c: int = 0,
    component: str = "composite",
) -> RenderedPng:
    """Render one semantic TIFF selection as a canonical, normalized PNG."""
    with tifffile.TiffFile(path) as tif:
        if not tif.series:
            raise ValueError("TIFF does not contain an image series")

        series = tif.series[0]
        axes = series.axes or ""
        selected_component = validate_plane_selection(
            tuple(int(size) for size in series.shape),
            axes,
            t=t,
            z=z,
            c=c,
            component=component,
        )
        array = series.asarray()

    return render_array_plane_png(
        array,
        axes,
        t=t,
        z=z,
        c=c,
        component=selected_component,
    )
