import numpy as np


def normalize_to_uint8(image: np.ndarray) -> np.ndarray:
    """Preserve uint8 or percentile-normalize uint16 data to uint8."""
    if image.dtype == np.uint8:
        return image

    if image.dtype != np.uint16:
        raise ValueError("Unsupported normalization dtype")

    lower, upper = np.percentile(image, (1, 99))
    if upper == lower:
        return np.zeros(image.shape, dtype=np.uint8)

    clipped = np.clip(image, lower, upper)
    scaled = (clipped.astype(np.float64) - lower) / (upper - lower) * 255.0
    return np.clip(scaled, 0, 255).astype(np.uint8)
