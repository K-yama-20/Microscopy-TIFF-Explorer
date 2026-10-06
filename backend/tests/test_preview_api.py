import asyncio
from io import BytesIO
from pathlib import Path
from uuid import uuid4

import httpx
import numpy as np
import pytest
import tifffile
from PIL import Image

from app.core.config import Settings
from app.main import create_app


def make_app(storage_dir: Path):
    return create_app(
        Settings(
            max_upload_size_bytes=1024 * 1024,
            temp_storage_dir=storage_dir,
            allowed_origins=("http://localhost:5173",),
        )
    )


def make_tiff_bytes(
    array: np.ndarray,
    axes: str,
    *,
    photometric: str = "minisblack",
    planarconfig: str | None = None,
    compression: str | None = None,
) -> bytes:
    output = BytesIO()
    tifffile.imwrite(
        output,
        array,
        ome=True,
        metadata={"axes": axes},
        photometric=photometric,
        planarconfig=planarconfig,
        compression=compression,
    )
    return output.getvalue()


def upload_and_preview(
    app,
    content: bytes,
    query: str = "",
) -> tuple[httpx.Response, httpx.Response]:
    async def send_requests() -> tuple[httpx.Response, httpx.Response]:
        transport = httpx.ASGITransport(app=app, raise_app_exceptions=False)
        async with httpx.AsyncClient(
            transport=transport,
            base_url="http://testserver",
        ) as client:
            upload = await client.post(
                "/api/tiff/upload",
                files={"file": ("sample.ome.tif", content, "image/tiff")},
            )
            file_id = upload.json()["file_id"]
            preview = await client.get(f"/api/tiff/{file_id}/preview{query}")
            return upload, preview

    return asyncio.run(send_requests())


def png_array(response: httpx.Response) -> tuple[Image.Image, np.ndarray]:
    image = Image.open(BytesIO(response.content))
    return image, np.asarray(image)


@pytest.mark.parametrize("dtype", [np.uint8, np.uint16])
def test_previews_non_rgb_composite_and_defaults_component(
    tmp_path: Path,
    dtype: np.typing.DTypeLike,
) -> None:
    array = np.arange(2 * 3 * 4 * 5 * 7, dtype=dtype).reshape(2, 3, 4, 5, 7)

    upload, preview = upload_and_preview(
        make_app(tmp_path),
        make_tiff_bytes(array, "TZCYX"),
        "?t=1&z=2&c=3",
    )

    assert upload.status_code == 201
    assert preview.status_code == 200
    assert preview.headers["content-type"] == "image/png"
    assert preview.headers["cache-control"] == "no-store, private"
    image, decoded = png_array(preview)
    assert image.mode == "L"
    assert decoded.shape == (5, 7)


def test_previews_lzw_compressed_tiff(tmp_path: Path) -> None:
    array = np.arange(5 * 7, dtype=np.uint8).reshape(5, 7)

    upload, preview = upload_and_preview(
        make_app(tmp_path),
        make_tiff_bytes(array, "YX", compression="lzw"),
    )

    assert upload.status_code == 201
    assert preview.status_code == 200
    image, decoded = png_array(preview)
    assert image.mode == "L"
    np.testing.assert_array_equal(decoded, array)


def test_preview_without_max_size_preserves_original_dimensions(
    tmp_path: Path,
) -> None:
    array = np.arange(180 * 320, dtype=np.uint16).reshape(180, 320)

    _, preview = upload_and_preview(
        make_app(tmp_path),
        make_tiff_bytes(array, "YX"),
    )

    image, decoded = png_array(preview)
    assert preview.status_code == 200
    assert image.size == (320, 180)
    assert decoded.shape == (180, 320)


@pytest.mark.parametrize(
    ("shape", "expected_size"),
    [
        ((300, 600), (240, 120)),
        ((600, 300), (120, 240)),
        ((120, 180), (180, 120)),
    ],
)
def test_preview_max_size_downscales_without_upscaling_and_preserves_aspect_ratio(
    tmp_path: Path,
    shape: tuple[int, int],
    expected_size: tuple[int, int],
) -> None:
    array = np.arange(np.prod(shape), dtype=np.uint16).reshape(shape)

    _, preview = upload_and_preview(
        make_app(tmp_path),
        make_tiff_bytes(array, "YX"),
        "?max_size=240",
    )

    image, _ = png_array(preview)
    assert preview.status_code == 200
    assert image.size == expected_size


def test_preview_max_size_preserves_rgb_composite_mode(tmp_path: Path) -> None:
    array = np.arange(300 * 600 * 3, dtype=np.uint8).reshape(300, 600, 3)

    _, preview = upload_and_preview(
        make_app(tmp_path),
        make_tiff_bytes(
            array,
            "YXS",
            photometric="rgb",
            planarconfig="contig",
        ),
        "?max_size=240",
    )

    image, decoded = png_array(preview)
    assert preview.status_code == 200
    assert image.mode == "RGB"
    assert image.size == (240, 120)
    assert decoded.shape == (120, 240, 3)


@pytest.mark.parametrize("max_size", ["0", "-1", "4097", "not-a-number"])
def test_rejects_invalid_preview_max_size(
    tmp_path: Path,
    max_size: str,
) -> None:
    _, response = upload_and_preview(
        make_app(tmp_path),
        make_tiff_bytes(np.zeros((5, 7), dtype=np.uint8), "YX"),
        f"?max_size={max_size}",
    )

    assert response.status_code == 422
    assert response.json() == {
        "error": {
            "code": "INVALID_REQUEST",
            "message": "The request contains invalid or missing parameters.",
        }
    }


@pytest.mark.parametrize(
    ("axes", "shape", "planarconfig"),
    [
        ("YXS", (5, 7, 3), "contig"),
        ("SYX", (3, 5, 7), "separate"),
        ("TZCYXS", (2, 2, 2, 5, 7, 3), "contig"),
    ],
)
def test_previews_rgb_composites_in_canonical_color_shape(
    tmp_path: Path,
    axes: str,
    shape: tuple[int, ...],
    planarconfig: str,
) -> None:
    array = np.arange(np.prod(shape), dtype=np.uint8).reshape(shape)
    query = "?t=1&z=1&c=1" if axes == "TZCYXS" else ""

    upload, preview = upload_and_preview(
        make_app(tmp_path),
        make_tiff_bytes(
            array,
            axes,
            photometric="rgb",
            planarconfig=planarconfig,
        ),
        query,
    )

    assert upload.status_code == 201
    assert upload.json()["metadata"]["axes"] == axes
    assert preview.status_code == 200
    image, decoded = png_array(preview)
    assert image.mode == "RGB"
    assert decoded.shape == (5, 7, 3)
    if axes == "TZCYXS":
        np.testing.assert_array_equal(decoded, array[1, 1, 1])


@pytest.mark.parametrize(
    ("component", "sample"),
    [("red", 0), ("green", 1), ("blue", 2)],
)
def test_previews_rgb_components_as_matching_grayscale(
    tmp_path: Path,
    component: str,
    sample: int,
) -> None:
    array = np.zeros((5, 7, 3), dtype=np.uint8)
    array[..., 0] = 10
    array[..., 1] = 20
    array[..., 2] = 30

    _, preview = upload_and_preview(
        make_app(tmp_path),
        make_tiff_bytes(array, "YXS", photometric="rgb", planarconfig="contig"),
        f"?component={component}",
    )

    image, decoded = png_array(preview)
    assert image.mode == "L"
    assert np.all(decoded == (sample + 1) * 10)


def test_previews_uint16_rgb_composite_and_isolated_component(
    tmp_path: Path,
) -> None:
    array = np.arange(5 * 7 * 3, dtype=np.uint16).reshape(5, 7, 3) * 100
    content = make_tiff_bytes(
        array,
        "YXS",
        photometric="rgb",
        planarconfig="contig",
    )

    _, composite = upload_and_preview(make_app(tmp_path), content)
    _, red = upload_and_preview(
        make_app(tmp_path),
        content,
        "?component=red",
    )

    composite_image, composite_array = png_array(composite)
    red_image, red_array = png_array(red)
    assert composite.status_code == 200
    assert composite_image.mode == "RGB"
    assert composite_array.dtype == np.uint8
    assert red.status_code == 200
    assert red_image.mode == "L"
    assert red_array.dtype == np.uint8


def test_preview_calls_shared_normalization_once_with_canonical_plane(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    array = np.empty((3, 5, 7), dtype=np.uint16)
    array[0] = 100
    array[1] = 1000
    array[2] = 5000
    calls: list[np.ndarray] = []
    normalized_result = np.arange(5 * 7 * 3, dtype=np.uint8).reshape(5, 7, 3)

    def normalization_spy(image: np.ndarray) -> np.ndarray:
        calls.append(image.copy())
        return normalized_result

    monkeypatch.setattr(
        "app.services.plane_rendering.normalize_to_uint8", normalization_spy
    )

    _, preview = upload_and_preview(
        make_app(tmp_path),
        make_tiff_bytes(
            array,
            "SYX",
            photometric="rgb",
            planarconfig="separate",
        ),
    )

    assert preview.status_code == 200
    assert len(calls) == 1
    np.testing.assert_array_equal(calls[0], np.transpose(array, (1, 2, 0)))
    assert calls[0].shape == (5, 7, 3)
    assert calls[0].dtype == np.uint16
    _, decoded = png_array(preview)
    np.testing.assert_array_equal(decoded, normalized_result)


@pytest.mark.parametrize("query", ["?t=-1", "?z=1", "?c=1"])
def test_rejects_invalid_dimension_indices(tmp_path: Path, query: str) -> None:
    _, response = upload_and_preview(
        make_app(tmp_path),
        make_tiff_bytes(np.zeros((5, 7), dtype=np.uint8), "YX"),
        query,
    )

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "INVALID_DIMENSION_INDEX"


@pytest.mark.parametrize("component", ["cyan", "red", "green", "blue"])
def test_rejects_unknown_or_non_rgb_components(
    tmp_path: Path,
    component: str,
) -> None:
    _, response = upload_and_preview(
        make_app(tmp_path),
        make_tiff_bytes(np.zeros((5, 7), dtype=np.uint8), "YX"),
        f"?component={component}",
    )

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "INVALID_RGB_COMPONENT"


def test_missing_or_malformed_file_id_returns_file_not_found(tmp_path: Path) -> None:
    app = make_app(tmp_path)

    async def send_requests() -> list[httpx.Response]:
        transport = httpx.ASGITransport(app=app, raise_app_exceptions=False)
        async with httpx.AsyncClient(
            transport=transport,
            base_url="http://testserver",
        ) as client:
            return [
                await client.get(f"/api/tiff/{uuid4()}/preview"),
                await client.get("/api/tiff/not-a-uuid/preview"),
            ]

    for response in asyncio.run(send_requests()):
        assert response.status_code == 404
        assert response.json()["error"]["code"] == "FILE_NOT_FOUND"
        assert str(tmp_path) not in response.text
        assert "Traceback" not in response.text


def test_processing_failure_does_not_expose_internal_details(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    app = make_app(tmp_path)

    async def send_requests() -> httpx.Response:
        transport = httpx.ASGITransport(app=app, raise_app_exceptions=False)
        async with httpx.AsyncClient(
            transport=transport,
            base_url="http://testserver",
        ) as client:
            upload = await client.post(
                "/api/tiff/upload",
                files={
                    "file": (
                        "sample.tif",
                        make_tiff_bytes(np.zeros((5, 7), dtype=np.uint8), "YX"),
                        "image/tiff",
                    )
                },
            )
            monkeypatch.setattr(
                "app.services.plane_rendering.tifffile.TiffFile",
                lambda _path: (_ for _ in ()).throw(RuntimeError("secret path")),
            )
            return await client.get(f"/api/tiff/{upload.json()['file_id']}/preview")

    response = asyncio.run(send_requests())

    assert response.status_code == 500
    assert response.json()["error"]["code"] == "PROCESSING_ERROR"
    assert "secret path" not in response.text
    assert str(tmp_path) not in response.text
    assert "Traceback" not in response.text
