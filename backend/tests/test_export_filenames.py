import pytest

from app.services.export_filenames import (
    build_png_export_filename,
    build_zip_export_filename,
)
from app.services.plane_extraction import RgbComponent


@pytest.mark.parametrize(
    ("source", "expected_basename"),
    [
        ("sample.tif", "sample"),
        ("sample.tiff", "sample"),
        ("sample.ome.tif", "sample.ome"),
        (r"client\folder/sample.tif", "sample"),
        ('bad\r\n"name.tif', "bad_name"),
        ("bad..name.tif", "bad_name"),
        ('\r\n".tif', "image"),
    ],
)
def test_builds_safe_non_rgb_filenames(
    source: str,
    expected_basename: str,
) -> None:
    filename = build_png_export_filename(
        source,
        t=0,
        z=12,
        c=2,
        component=RgbComponent.COMPOSITE,
        is_rgb=False,
    )

    assert filename == f"{expected_basename}_T000_Z012_C002.png"
    assert "\r" not in filename
    assert "\n" not in filename
    assert '"' not in filename
    assert "/" not in filename
    assert "\\" not in filename


@pytest.mark.parametrize(
    ("component", "suffix"),
    [
        (RgbComponent.COMPOSITE, "RGB"),
        (RgbComponent.RED, "R"),
        (RgbComponent.GREEN, "G"),
        (RgbComponent.BLUE, "B"),
    ],
)
def test_builds_distinct_rgb_component_filenames(
    component: RgbComponent,
    suffix: str,
) -> None:
    assert (
        build_png_export_filename(
            "sample.tif",
            t=1,
            z=2,
            c=3,
            component=component,
            is_rgb=True,
        )
        == f"sample_T001_Z002_C003_{suffix}.png"
    )


@pytest.mark.parametrize(
    ("source", "component", "is_rgb", "expected"),
    [
        ("sample.tif", RgbComponent.COMPOSITE, False, "sample_stack.zip"),
        ("sample.tiff", RgbComponent.COMPOSITE, True, "sample_stack_RGB.zip"),
        ("sample.ome.tif", RgbComponent.RED, True, "sample.ome_stack_R.zip"),
        (r"..\unsafe/name.tif", RgbComponent.GREEN, True, "name_stack_G.zip"),
        ('bad\r\n"name.tif', RgbComponent.BLUE, True, "bad_name_stack_B.zip"),
        ("bad..name.tif", RgbComponent.COMPOSITE, False, "bad_name_stack.zip"),
    ],
)
def test_builds_safe_component_aware_zip_filenames(
    source: str,
    component: RgbComponent,
    is_rgb: bool,
    expected: str,
) -> None:
    filename = build_zip_export_filename(
        source,
        component=component,
        is_rgb=is_rgb,
    )

    assert filename == expected
    assert "/" not in filename
    assert "\\" not in filename
    assert ".." not in filename
