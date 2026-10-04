import logging
from pathlib import Path

import numpy as np
import tifffile

from app.models.errors import ApiServiceError
from app.models.upload import TiffMetadata

logger = logging.getLogger(__name__)

SUPPORTED_DTYPES = {np.dtype("uint8"), np.dtype("uint16")}
SUPPORTED_AXIS_NAMES = frozenset("TZCYX")


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
    except ApiServiceError:
        raise
    except Exception:
        logger.exception("TIFF metadata parsing failed")
        raise InvalidTiffError from None

    if dtype not in SUPPORTED_DTYPES:
        raise UnsupportedDtypeError

    if not _has_supported_axes(axes, shape):
        raise UnsupportedAxesError

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
    )


def _has_supported_axes(axes: str, shape: tuple[int, ...]) -> bool:
    return (
        len(axes) == len(shape)
        and len(set(axes)) == len(axes)
        and set(axes) <= SUPPORTED_AXIS_NAMES
        and "X" in axes
        and "Y" in axes
    )
