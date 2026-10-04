import logging
from pathlib import Path

import numpy as np
import tifffile

from app.models.errors import ApiServiceError
from app.models.upload import TiffMetadata

logger = logging.getLogger(__name__)

SUPPORTED_DTYPES = {np.dtype("uint8"), np.dtype("uint16")}
SUPPORTED_AXIS_NAMES = frozenset("TZCYXS")
RGB_COMPONENTS = ("red", "green", "blue")


class InvalidTiffError(ApiServiceError):
    def __init__(self) -> None:
        super().__init__(
            code="INVALID_TIFF",
            message="The TIFF file could not be interpreted.",
            status_code=422,
        )


class UnsupportedDtypeError(ApiServiceError):
    def __init__(self) -> None:
        super().__init__(
            code="UNSUPPORTED_DTYPE",
            message="Only uint8 and uint16 TIFF images are supported.",
            status_code=422,
        )


class UnsupportedAxesError(ApiServiceError):
    def __init__(self) -> None:
        super().__init__(
            code="UNSUPPORTED_AXES",
            message="The TIFF axes are missing, ambiguous, or unsupported.",
            status_code=422,
        )


def parse_tiff_metadata(path: Path) -> TiffMetadata:
    """Read primary-series metadata without loading the image pixel array."""
    try:
        with tifffile.TiffFile(path) as tif:
            if not tif.series:
                raise InvalidTiffError

            primary_series = tif.series[0]
            shape = tuple(int(size) for size in primary_series.shape)
            axes = primary_series.axes or ""
            dtype = np.dtype(primary_series.dtype)
            series_count = len(tif.series)
            first_page = primary_series.pages[0]
            photometric = first_page.photometric
            samples_per_pixel = int(first_page.samplesperpixel)
    except ApiServiceError:
        raise
    except Exception:
        logger.exception("TIFF metadata parsing failed")
        raise InvalidTiffError from None

    if dtype not in SUPPORTED_DTYPES:
        raise UnsupportedDtypeError

    if not _has_supported_axes(axes, shape):
        raise UnsupportedAxesError

    is_rgb = _is_supported_rgb(
        axes,
        shape,
        photometric=photometric,
        samples_per_pixel=samples_per_pixel,
    )

    axis_sizes = dict(zip(axes, shape, strict=True))
    return TiffMetadata(
        shape=list(shape),
        axes=axes,
        dtype=dtype.name,
        width=axis_sizes["X"],
        height=axis_sizes["Y"],
        time_points=axis_sizes.get("T", 1),
        z_slices=axis_sizes.get("Z", 1),
        channels=axis_sizes.get("C", 1),
        series_count=series_count,
        is_rgb=is_rgb,
        sample_count=3 if is_rgb else 1,
        rgb_components=list(RGB_COMPONENTS) if is_rgb else [],
    )


def _has_supported_axes(axes: str, shape: tuple[int, ...]) -> bool:
    return (
        len(axes) == len(shape)
        and len(set(axes)) == len(axes)
        and set(axes) <= SUPPORTED_AXIS_NAMES
        and "X" in axes
        and "Y" in axes
    )


def _is_supported_rgb(
    axes: str,
    shape: tuple[int, ...],
    *,
    photometric: object,
    samples_per_pixel: int,
) -> bool:
    """Validate the TIFF sample model without guessing from dimension sizes."""
    has_sample_axis = "S" in axes
    is_rgb_photometric = getattr(photometric, "name", None) == "RGB"

    if not has_sample_axis:
        if is_rgb_photometric or samples_per_pixel != 1:
            raise UnsupportedAxesError
        return False

    sample_size = shape[axes.index("S")]
    if not is_rgb_photometric or samples_per_pixel != 3 or sample_size != 3:
        raise UnsupportedAxesError

    return True
