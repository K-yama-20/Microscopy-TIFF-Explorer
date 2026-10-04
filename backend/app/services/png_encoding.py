from io import BytesIO

import numpy as np
from PIL import Image

from app.models.errors import ApiServiceError


class PngEncodingError(ApiServiceError):
    def __init__(self) -> None:
        super().__init__(
            code="PROCESSING_ERROR",
            message="The image preview could not be generated.",
            status_code=500,
        )


def encode_png(image: np.ndarray) -> bytes:
    """Encode canonical uint8 YX or YXS image data entirely in memory."""
    try:
        if image.dtype != np.uint8:
            raise ValueError("PNG input must be uint8")
        if image.ndim == 2 or (image.ndim == 3 and image.shape[2] == 3):
            pil_image = Image.fromarray(image)
        else:
            raise ValueError("PNG input must be canonical YX or YXS")

        output = BytesIO()
        pil_image.save(output, format="PNG")
        return output.getvalue()
    except Exception:
        raise PngEncodingError from None
