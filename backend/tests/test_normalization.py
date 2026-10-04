import warnings

import numpy as np
import pytest

from app.services.normalization import normalize_to_uint8


def expected_uint16_normalization(image: np.ndarray) -> np.ndarray:
    lower, upper = np.percentile(image, (1, 99))
    if upper == lower:
        return np.zeros(image.shape, dtype=np.uint8)

    clipped = np.clip(image, lower, upper)
    scaled = (clipped.astype(np.float64) - lower) / (upper - lower) * 255.0
    return np.clip(scaled, 0, 255).astype(np.uint8)


@pytest.mark.parametrize(
    "image",
    [
        pytest.param(
            np.arange(35, dtype=np.uint8).reshape(5, 7),
            id="grayscale-yx",
        ),
        pytest.param(
            np.arange(105, dtype=np.uint8).reshape(5, 7, 3),
            id="rgb-composite-yxs",
        ),
        pytest.param(
            np.arange(35, dtype=np.uint8).reshape(5, 7) + 100,
            id="isolated-component-yx",
        ),
    ],
)
def test_uint8_pass_through_preserves_values_dtype_and_shape(
    image: np.ndarray,
) -> None:
    normalized = normalize_to_uint8(image)

    np.testing.assert_array_equal(normalized, image)
    assert normalized.dtype == np.uint8
    assert normalized.shape == image.shape


def test_normalizes_uint16_grayscale_with_first_and_99th_percentiles() -> None:
    image = np.arange(100, dtype=np.uint16).reshape(10, 10)

    normalized = normalize_to_uint8(image)
    expected = expected_uint16_normalization(image)
    lower, upper = np.percentile(image, (1, 99))

    np.testing.assert_array_equal(normalized, expected)
    assert normalized[image <= lower].max() == 0
    assert normalized[image >= upper].min() == 255
    assert normalized[5, 0] == expected[5, 0]
    assert 0 < normalized[5, 0] < 255
    assert normalized.dtype == np.uint8
    assert normalized.shape == image.shape


def test_rgb_composite_uses_one_shared_pair_of_bounds() -> None:
    image = np.empty((10, 10, 3), dtype=np.uint16)
    image[..., 0] = np.arange(100, 200, dtype=np.uint16).reshape(10, 10)
    image[..., 1] = np.arange(1000, 1100, dtype=np.uint16).reshape(10, 10)
    image[..., 2] = np.arange(5000, 5100, dtype=np.uint16).reshape(10, 10)

    normalized = normalize_to_uint8(image)
    shared_bounds_expected = expected_uint16_normalization(image)
    independent_bounds_result = np.stack(
        [expected_uint16_normalization(image[..., sample]) for sample in range(3)],
        axis=-1,
    )

    np.testing.assert_array_equal(normalized, shared_bounds_expected)
    assert not np.array_equal(normalized, independent_bounds_result)
    assert normalized[..., 0].max() < normalized[..., 1].min()
    assert normalized[..., 1].max() < normalized[..., 2].min()
    assert normalized.dtype == np.uint8
    assert normalized.shape == image.shape


def test_isolated_component_uses_only_its_own_bounds() -> None:
    composite = np.empty((10, 10, 3), dtype=np.uint16)
    composite[..., 0] = np.arange(100, dtype=np.uint16).reshape(10, 10)
    composite[..., 1] = np.arange(1000, 1100, dtype=np.uint16).reshape(10, 10)
    composite[..., 2] = np.arange(50000, 50100, dtype=np.uint16).reshape(10, 10)
    component = composite[..., 1]

    normalized = normalize_to_uint8(component)
    component_bounds_expected = expected_uint16_normalization(component)
    composite_bounds_component = expected_uint16_normalization(composite)[..., 1]

    np.testing.assert_array_equal(normalized, component_bounds_expected)
    assert not np.array_equal(normalized, composite_bounds_component)
    assert normalized[5, 0] == component_bounds_expected[5, 0]
    assert 0 < normalized[5, 0] < 255
    assert normalized.dtype == np.uint8
    assert normalized.shape == component.shape


def assert_constant_uint16_normalizes_safely(image: np.ndarray) -> None:
    with warnings.catch_warnings():
        warnings.simplefilter("error")
        normalized = normalize_to_uint8(image)

    assert normalized.dtype == np.uint8
    assert normalized.shape == image.shape
    assert np.all(normalized == 0)


def test_constant_uint16_grayscale_returns_uniform_zero_image() -> None:
    assert_constant_uint16_normalizes_safely(np.full((5, 7), 1234, dtype=np.uint16))


def test_constant_uint16_rgb_composite_returns_uniform_zero_image() -> None:
    assert_constant_uint16_normalizes_safely(np.full((5, 7, 3), 1234, dtype=np.uint16))


def test_constant_uint16_isolated_component_returns_uniform_zero_image() -> None:
    assert_constant_uint16_normalizes_safely(np.full((5, 7), 4321, dtype=np.uint16))


def test_uint16_high_dynamic_range_clips_outliers_and_uses_normal_range() -> None:
    normal_values = np.linspace(1000, 5000, 990, dtype=np.uint16)
    image = np.concatenate(
        (
            np.zeros(5, dtype=np.uint16),
            normal_values,
            np.full(5, 65535, dtype=np.uint16),
        )
    ).reshape(20, 50)

    normalized = normalize_to_uint8(image)
    expected = expected_uint16_normalization(image)
    lower, upper = np.percentile(image, (1, 99))

    np.testing.assert_array_equal(normalized, expected)
    assert 0 < lower < upper < 65535
    assert np.all(normalized.ravel()[:5] == 0)
    assert np.all(normalized.ravel()[-5:] == 255)
    assert 100 < normalized.ravel()[500] < 155
    assert normalized.dtype == np.uint8
    assert normalized.shape == image.shape


@pytest.mark.parametrize(
    "dtype",
    [np.float32, np.int16, np.uint32, np.float64],
)
def test_rejects_unsupported_dtype(dtype: np.typing.DTypeLike) -> None:
    image = np.arange(12, dtype=dtype).reshape(3, 4)

    with pytest.raises(ValueError, match="Unsupported normalization dtype"):
        normalize_to_uint8(image)
