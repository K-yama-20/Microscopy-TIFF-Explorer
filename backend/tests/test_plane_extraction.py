import numpy as np
import pytest

from app.services.plane_extraction import (
    InvalidDimensionIndexError,
    InvalidRgbComponentError,
    extract_plane,
)


def test_extracts_non_rgb_composite_as_canonical_yx() -> None:
    array = np.arange(2 * 3 * 4 * 5 * 7, dtype=np.uint16).reshape(2, 3, 4, 5, 7)

    plane = extract_plane(array, "TZCYX", t=1, z=2, c=3)

    assert plane.shape == (5, 7)
    np.testing.assert_array_equal(plane, array[1, 2, 3])


def test_extracts_interleaved_rgb_composite_without_copying() -> None:
    array = np.arange(5 * 7 * 3, dtype=np.uint8).reshape(5, 7, 3)

    plane = extract_plane(array, "YXS")

    assert plane.shape == (5, 7, 3)
    assert np.shares_memory(plane, array)
    np.testing.assert_array_equal(plane, array)


def test_canonicalizes_planar_rgb_and_extracts_each_component() -> None:
    array = np.arange(3 * 5 * 7, dtype=np.uint8).reshape(3, 5, 7)

    composite = extract_plane(array, "SYX")

    assert composite.shape == (5, 7, 3)
    assert np.shares_memory(composite, array)
    for index, component in enumerate(("red", "green", "blue")):
        plane = extract_plane(array, "SYX", component=component)
        assert plane.shape == (5, 7)
        np.testing.assert_array_equal(plane, array[index])


def test_keeps_channel_and_rgb_sample_axes_independent() -> None:
    array = np.arange(2 * 5 * 7 * 3, dtype=np.uint16).reshape(2, 5, 7, 3)

    composite = extract_plane(array, "CYXS", c=1)
    green = extract_plane(array, "CYXS", c=1, component="green")

    np.testing.assert_array_equal(composite, array[1])
    np.testing.assert_array_equal(green, array[1, :, :, 1])


@pytest.mark.parametrize(
    ("axes", "shape", "kwargs"),
    [
        ("YX", (5, 7), {"t": -1}),
        ("YX", (5, 7), {"z": 1}),
        ("CYX", (2, 5, 7), {"c": 2}),
        ("TZCYX", (2, 3, 4, 5, 7), {"t": 2}),
    ],
)
def test_rejects_negative_missing_or_out_of_range_indices(
    axes: str,
    shape: tuple[int, ...],
    kwargs: dict[str, int],
) -> None:
    with pytest.raises(InvalidDimensionIndexError):
        extract_plane(np.zeros(shape, dtype=np.uint8), axes, **kwargs)


@pytest.mark.parametrize("component", ["red", "green", "blue", "unknown"])
def test_rejects_invalid_or_inapplicable_components(component: str) -> None:
    with pytest.raises(InvalidRgbComponentError):
        extract_plane(
            np.zeros((5, 7), dtype=np.uint8),
            "YX",
            component=component,
        )
