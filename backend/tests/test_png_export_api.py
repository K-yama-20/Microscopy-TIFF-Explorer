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
) -> bytes:
    output = BytesIO()
    tifffile.imwrite(
        output,
        array,
        ome=True,
        metadata={"axes": axes},
        photometric=photometric,
        planarconfig=planarconfig,
    )
    return output.getvalue()


def upload_and_get(
    app,
    content: bytes,
    *,
    filename: str = "sample.tif",
    paths: tuple[str, ...],
) -> list[httpx.Response]:
    async def send_requests() -> list[httpx.Response]:
        transport = httpx.ASGITransport(app=app, raise_app_exceptions=False)
        async with httpx.AsyncClient(
            transport=transport,
            base_url="http://testserver",
        ) as client:
            upload = await client.post(
                "/api/tiff/upload",
                files={"file": (filename, content, "image/tiff")},
            )
            assert upload.status_code == 201
            file_id = upload.json()["file_id"]
            return [await client.get(path.format(file_id=file_id)) for path in paths]

    return asyncio.run(send_requests())


def decode_png(response: httpx.Response) -> tuple[str, np.ndarray]:
    with Image.open(BytesIO(response.content)) as image:
        return image.mode, np.asarray(image).copy()


@pytest.mark.parametrize("dtype", [np.uint8, np.uint16])
def test_exports_non_rgb_composite_with_download_headers(
    tmp_path: Path,
    dtype: np.typing.DTypeLike,
) -> None:
    array = np.arange(5 * 7, dtype=dtype).reshape(5, 7)
    omitted, explicit = upload_and_get(
        make_app(tmp_path),
        make_tiff_bytes(array, "YX"),
        filename="sample.ome.tif",
        paths=(
            "/api/tiff/{file_id}/export/png",
            "/api/tiff/{file_id}/export/png?component=composite",
        ),
    )

    for response in (omitted, explicit):
        mode, decoded = decode_png(response)
        assert response.status_code == 200
        assert response.headers["content-type"] == "image/png"
        assert response.headers["content-disposition"] == (
            'attachment; filename="sample.ome_T000_Z000_C000.png"'
        )
        assert response.headers["cache-control"] == "no-store, private"
        assert response.headers["pragma"] == "no-cache"
        assert response.headers["x-content-type-options"] == "nosniff"
        assert "_RGB" not in response.headers["content-disposition"]
        assert mode == "L"
        assert decoded.dtype == np.uint8


@pytest.mark.parametrize(
    ("axes", "shape", "planarconfig"),
    [
        ("YXS", (5, 7, 3), "contig"),
        ("SYX", (3, 5, 7), "separate"),
    ],
)
@pytest.mark.parametrize("dtype", [np.uint8, np.uint16])
def test_exports_interleaved_and_planar_rgb_composites(
    tmp_path: Path,
    axes: str,
    shape: tuple[int, ...],
    planarconfig: str,
    dtype: np.typing.DTypeLike,
) -> None:
    array = np.arange(np.prod(shape), dtype=dtype).reshape(shape)
    (response,) = upload_and_get(
        make_app(tmp_path),
        make_tiff_bytes(
            array,
            axes,
            photometric="rgb",
            planarconfig=planarconfig,
        ),
        paths=("/api/tiff/{file_id}/export/png",),
    )

    mode, decoded = decode_png(response)
    assert response.status_code == 200
    assert mode == "RGB"
    assert decoded.shape == (5, 7, 3)
    assert decoded.dtype == np.uint8
    assert (
        'filename="sample_T000_Z000_C000_RGB.png"'
        in response.headers["content-disposition"]
    )


@pytest.mark.parametrize(
    ("component", "sample", "suffix"),
    [("red", 0, "R"), ("green", 1, "G"), ("blue", 2, "B")],
)
def test_exports_rgb_components_as_matching_grayscale(
    tmp_path: Path,
    component: str,
    sample: int,
    suffix: str,
) -> None:
    array = np.zeros((5, 7, 3), dtype=np.uint8)
    array[..., 0] = 10
    array[..., 1] = 20
    array[..., 2] = 30
    (response,) = upload_and_get(
        make_app(tmp_path),
        make_tiff_bytes(array, "YXS", photometric="rgb", planarconfig="contig"),
        paths=(f"/api/tiff/{{file_id}}/export/png?component={component}",),
    )

    mode, decoded = decode_png(response)
    assert mode == "L"
    assert np.all(decoded == (sample + 1) * 10)
    assert f'_C000_{suffix}.png"' in response.headers["content-disposition"]


def test_keeps_microscopy_channel_and_rgb_component_independent(
    tmp_path: Path,
) -> None:
    array = np.zeros((2, 5, 7, 3), dtype=np.uint8)
    array[0, ..., 1] = 20
    array[1, ..., 1] = 90
    (response,) = upload_and_get(
        make_app(tmp_path),
        make_tiff_bytes(
            array,
            "CYXS",
            photometric="rgb",
            planarconfig="contig",
        ),
        paths=("/api/tiff/{file_id}/export/png?c=1&component=green",),
    )

    mode, decoded = decode_png(response)
    assert mode == "L"
    assert np.all(decoded == 90)
    assert '_C001_G.png"' in response.headers["content-disposition"]


@pytest.mark.parametrize(
    ("array", "axes", "photometric", "planarconfig", "query"),
    [
        (np.arange(35, dtype=np.uint8).reshape(5, 7), "YX", "minisblack", None, ""),
        (
            np.arange(35, dtype=np.uint16).reshape(5, 7) * 100,
            "YX",
            "minisblack",
            None,
            "",
        ),
        (
            np.arange(105, dtype=np.uint8).reshape(5, 7, 3),
            "YXS",
            "rgb",
            "contig",
            "",
        ),
        (
            np.arange(105, dtype=np.uint16).reshape(5, 7, 3) * 100,
            "YXS",
            "rgb",
            "contig",
            "?component=blue",
        ),
    ],
)
def test_export_pixels_match_preview_for_the_same_selection(
    tmp_path: Path,
    array: np.ndarray,
    axes: str,
    photometric: str,
    planarconfig: str | None,
    query: str,
) -> None:
    preview, exported = upload_and_get(
        make_app(tmp_path),
        make_tiff_bytes(
            array,
            axes,
            photometric=photometric,
            planarconfig=planarconfig,
        ),
        paths=(
            f"/api/tiff/{{file_id}}/preview{query}",
            f"/api/tiff/{{file_id}}/export/png{query}",
        ),
    )

    preview_mode, preview_pixels = decode_png(preview)
    export_mode, export_pixels = decode_png(exported)
    assert export_mode == preview_mode
    np.testing.assert_array_equal(export_pixels, preview_pixels)


def test_thumbnail_preview_does_not_change_png_export_resolution(
    tmp_path: Path,
) -> None:
    array = np.arange(300 * 600, dtype=np.uint16).reshape(300, 600)
    thumbnail, exported = upload_and_get(
        make_app(tmp_path),
        make_tiff_bytes(array, "YX"),
        paths=(
            "/api/tiff/{file_id}/preview?max_size=240",
            "/api/tiff/{file_id}/export/png",
        ),
    )

    _, thumbnail_pixels = decode_png(thumbnail)
    _, export_pixels = decode_png(exported)
    assert thumbnail_pixels.shape == (120, 240)
    assert export_pixels.shape == (300, 600)


@pytest.mark.parametrize(
    "query",
    ["?t=-1", "?z=1", "?c=1"],
)
def test_rejects_invalid_dimension_indices(tmp_path: Path, query: str) -> None:
    (response,) = upload_and_get(
        make_app(tmp_path),
        make_tiff_bytes(np.zeros((5, 7), dtype=np.uint8), "YX"),
        paths=(f"/api/tiff/{{file_id}}/export/png{query}",),
    )

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "INVALID_DIMENSION_INDEX"


@pytest.mark.parametrize("component", ["cyan", "red", "green", "blue"])
def test_rejects_unknown_or_non_rgb_components(
    tmp_path: Path,
    component: str,
) -> None:
    (response,) = upload_and_get(
        make_app(tmp_path),
        make_tiff_bytes(np.zeros((5, 7), dtype=np.uint8), "YX"),
        paths=(f"/api/tiff/{{file_id}}/export/png?component={component}",),
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
                await client.get(f"/api/tiff/{uuid4()}/export/png"),
                await client.get("/api/tiff/not-a-uuid/export/png"),
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

    async def send_request() -> httpx.Response:
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
            return await client.get(f"/api/tiff/{upload.json()['file_id']}/export/png")

    response = asyncio.run(send_request())

    assert response.status_code == 500
    assert response.json()["error"]["code"] == "PROCESSING_ERROR"
    assert "secret path" not in response.text
    assert str(tmp_path) not in response.text
    assert "Traceback" not in response.text


def test_cors_exposes_content_disposition_without_widening_origins(
    tmp_path: Path,
) -> None:
    (response,) = upload_and_get(
        make_app(tmp_path),
        make_tiff_bytes(np.zeros((5, 7), dtype=np.uint8), "YX"),
        paths=("/api/tiff/{file_id}/export/png",),
    )
    # ASGI CORS response headers are emitted only for cross-origin requests.
    request = response.request
    assert request.url.path.endswith("/export/png")

    async def get_with_origin() -> httpx.Response:
        app = make_app(tmp_path / "cors")
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
            return await client.get(
                f"/api/tiff/{upload.json()['file_id']}/export/png",
                headers={"Origin": "http://localhost:5173"},
            )

    cors_response = asyncio.run(get_with_origin())
    assert cors_response.headers["access-control-allow-origin"] == (
        "http://localhost:5173"
    )
    assert cors_response.headers["access-control-expose-headers"] == (
        "Content-Disposition"
    )
