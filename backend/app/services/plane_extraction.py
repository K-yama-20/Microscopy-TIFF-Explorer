from enum import StrEnum

import numpy as np

from app.models.errors import ApiServiceError


class RgbComponent(StrEnum):
    COMPOSITE = "composite"
    RED = "red"
    GREEN = "green"
    BLUE = "blue"


class InvalidDimensionIndexError(ApiServiceError):
    def __init__(self) -> None:
        super().__init__(
            code="INVALID_DIMENSION_INDEX",
            message="One or more image dimension indices are out of range.",
            status_code=422,
        )


class InvalidRgbComponentError(ApiServiceError):
    def __init__(self) -> None:
        super().__init__(
            code="INVALID_RGB_COMPONENT",
            message="Choose composite, red, green, or blue for this image.",
            status_code=422,
        )


def parse_rgb_component(component: str) -> RgbComponent:
    try:
        return RgbComponent(component)
    except ValueError:
        raise InvalidRgbComponentError from None


def extract_plane(
    array: np.ndarray,
    axes: str,
    *,
    t: int = 0,
    z: int = 0,
    c: int = 0,
    component: RgbComponent | str = RgbComponent.COMPOSITE,
) -> np.ndarray:
    """Select semantic T/Z/C/S values and return canonical YX or YXS data."""
    selected_component = validate_plane_selection(
        array.shape,
        axes,
        t=t,
        z=z,
        c=c,
        component=component,
    )
    is_rgb = "S" in axes

    semantic_indices = {"T": t, "Z": z, "C": c}
    component_index = {
        RgbComponent.RED: 0,
        RgbComponent.GREEN: 1,
        RgbComponent.BLUE: 2,
    }.get(selected_component)

    selection: list[int | slice] = []
    retained_axes: list[str] = []
    for axis in axes:
        if axis in semantic_indices:
            selection.append(semantic_indices[axis])
        elif axis == "S" and component_index is not None:
            selection.append(component_index)
        else:
            selection.append(slice(None))
            retained_axes.append(axis)

    plane = array[tuple(selection)]
    canonical_axes = "YXS" if is_rgb and component_index is None else "YX"
    permutation = tuple(retained_axes.index(axis) for axis in canonical_axes)
    if permutation != tuple(range(len(permutation))):
        plane = np.transpose(plane, permutation)
    return plane


def validate_plane_selection(
    shape: tuple[int, ...],
    axes: str,
    *,
    t: int = 0,
    z: int = 0,
    c: int = 0,
    component: RgbComponent | str = RgbComponent.COMPOSITE,
) -> RgbComponent:
    """Validate selectors from series metadata before loading pixel data."""
    selected_component = (
        parse_rgb_component(component) if isinstance(component, str) else component
    )
    is_rgb = "S" in axes

    if not is_rgb and selected_component is not RgbComponent.COMPOSITE:
        raise InvalidRgbComponentError

    semantic_indices = {"T": t, "Z": z, "C": c}
    for axis, index in semantic_indices.items():
        count = int(shape[axes.index(axis)]) if axis in axes else 1
        if index < 0 or index >= count:
            raise InvalidDimensionIndexError

    return selected_component
