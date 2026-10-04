import numpy as np

from app.services.normalization import normalize_to_uint8


def test_preserves_uint8_grayscale_and_rgb_values() -> None:
    for image in (
        np.arange(35, dtype=np.uint8).reshape(5, 7),
        np.arange(105, dtype=np.uint8).reshape(5, 7, 3),
    ):
        normalized = normalize_to_uint8(image)

        assert normalized is image
        assert normalized.dtype == np.uint8


def test_normalizes_uint16_grayscale_to_full_uint8_range() -> None:
    image = np.arange(100, dtype=np.uint16).reshape(10, 10)

    normalized = normalize_to_uint8(image)

    assert normalized.dtype == np.uint8
    assert normalized.shape == image.shape
    assert normalized.min() == 0
    assert normalized.max() == 255


def test_rgb_composite_uses_one_shared_pair_of_bounds() -> None:
    image = np.zeros((10, 10, 3), dtype=np.uint16)
    image[..., 0] = 100
    image[..., 1] = 200
    image[..., 2] = 300

    normalized = normalize_to_uint8(image)

    assert np.all(normalized[..., 0] == 0)
    assert 0 < normalized[..., 1].min() < 255
    assert np.all(normalized[..., 2] == 255)


def test_isolated_component_uses_its_own_bounds() -> None:
    component = np.arange(100, dtype=np.uint16).reshape(10, 10) + 1000

    normalized = normalize_to_uint8(component)

    assert normalized.min() == 0
    assert normalized.max() == 255


def test_constant_uint16_image_returns_uniform_zero_image() -> None:
    image = np.full((5, 7, 3), 1234, dtype=np.uint16)

    normalized = normalize_to_uint8(image)

    assert normalized.dtype == np.uint8
    assert normalized.shape == image.shape
    assert np.all(normalized == 0)
