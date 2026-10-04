from pathlib import Path

import numpy as np
import pytest
import tifffile

from app.services.tiff_metadata import (
    InvalidTiffError,
    UnsupportedAxesError,
    UnsupportedDtypeError,
    parse_tiff_metadata,
)


@pytest.mark.parametrize(
    ("axes", "shape", "expected_counts"),
    [
        ("YX", (5, 7), (1, 1, 1)),
        ("ZYX", (2, 5, 7), (1, 2, 1)),
        ("CYX", (3, 5, 7), (1, 1, 3)),
        ("ZCYX", (2, 3, 5, 7), (1, 2, 3)),
        ("TZCYX", (2, 3, 4, 5, 7), (2, 3, 4)),
    ],
)
@pytest.mark.parametrize("dtype", [np.uint8, np.uint16])
def test_parses_supported_axes_and_dtypes(
    tmp_path: Path,
    axes: str,
    shape: tuple[int, ...],
    expected_counts: tuple[int, int, int],
    dtype: np.typing.DTypeLike,
) -> None:
    path = tmp_path / f"{axes}-{np.dtype(dtype).name}.ome.tif"
    tifffile.imwrite(
        path,
        np.zeros(shape, dtype=dtype),
        ome=True,
        metadata={"axes": axes},
        photometric="minisblack",
    )

    metadata = parse_tiff_metadata(path)

    assert metadata.shape == list(shape)
    assert metadata.axes == axes
    assert metadata.dtype == np.dtype(dtype).name
    assert metadata.width == shape[axes.index("X")]
    assert metadata.height == shape[axes.index("Y")]
    assert (
        metadata.time_points,
        metadata.z_slices,
        metadata.channels,
    ) == expected_counts
    assert metadata.series_count == 1


def test_counts_all_series_but_parses_the_primary_series(tmp_path: Path) -> None:
    path = tmp_path / "multiple-series.tif"
    with tifffile.TiffWriter(path) as writer:
        writer.write(
            np.zeros((5, 7), dtype=np.uint8),
            metadata={"axes": "YX"},
            photometric="minisblack",
        )
        writer.write(
            np.zeros((6, 8), dtype=np.uint8),
            metadata={"axes": "YX"},
            photometric="minisblack",
        )

    metadata = parse_tiff_metadata(path)

    assert metadata.shape == [5, 7]
    assert metadata.width == 7
    assert metadata.height == 5
    assert metadata.series_count == 2


def test_rejects_a_non_tiff_file(tmp_path: Path) -> None:
    path = tmp_path / "invalid.tif"
    path.write_bytes(b"not a TIFF")

    with pytest.raises(InvalidTiffError) as error:
        parse_tiff_metadata(path)

    assert error.value.code == "INVALID_TIFF"


def test_rejects_an_unsupported_dtype(tmp_path: Path) -> None:
    path = tmp_path / "uint32.ome.tif"
    tifffile.imwrite(
        path,
        np.zeros((5, 7), dtype=np.uint32),
        ome=True,
        metadata={"axes": "YX"},
    )

    with pytest.raises(UnsupportedDtypeError) as error:
        parse_tiff_metadata(path)

    assert error.value.code == "UNSUPPORTED_DTYPE"


def test_rejects_ambiguous_axes_instead_of_guessing_from_shape(
    tmp_path: Path,
) -> None:
    path = tmp_path / "ambiguous.tif"
    tifffile.imwrite(
        path,
        np.zeros((2, 5, 7), dtype=np.uint8),
        metadata=None,
        photometric="minisblack",
    )

    with tifffile.TiffFile(path) as tif:
        assert tif.series[0].axes == "IYX"

    with pytest.raises(UnsupportedAxesError) as error:
        parse_tiff_metadata(path)

    assert error.value.code == "UNSUPPORTED_AXES"
