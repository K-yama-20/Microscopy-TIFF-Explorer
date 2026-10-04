import asyncio
from io import BytesIO
from pathlib import Path
from uuid import UUID

import httpx
import numpy as np
import tifffile

from app.core.config import DEFAULT_MAX_UPLOAD_SIZE_MB, Settings
from app.main import create_app

TEST_MAX_UPLOAD_SIZE_BYTES = 1024 * 1024


def test_default_upload_limit_is_100_mb() -> None:
    settings = Settings()

    assert DEFAULT_MAX_UPLOAD_SIZE_MB == 100
    assert settings.max_upload_size_bytes == 100 * 1024 * 1024


def make_app(storage_dir: Path, max_size: int = TEST_MAX_UPLOAD_SIZE_BYTES):
    return create_app(
        Settings(
            max_upload_size_bytes=max_size,
            temp_storage_dir=storage_dir,
            allowed_origins=("http://localhost:5173",),
        )
    )


def make_tiff_bytes(
    shape: tuple[int, ...] = (5, 7),
    axes: str | None = "YX",
    dtype: np.typing.DTypeLike = np.uint8,
) -> bytes:
    output = BytesIO()
    tifffile.imwrite(
        output,
        np.zeros(shape, dtype=dtype),
        ome=axes is not None,
        metadata={"axes": axes} if axes is not None else None,
        photometric="minisblack",
    )
    return output.getvalue()


def upload(
    app,
    filename: str,
    content: bytes,
    *,
    origin: str | None = None,
) -> httpx.Response:
    async def send_request() -> httpx.Response:
        transport = httpx.ASGITransport(app=app, raise_app_exceptions=False)
        headers = {"Origin": origin} if origin else None
        async with httpx.AsyncClient(
            transport=transport,
            base_url="http://testserver",
        ) as client:
            return await client.post(
                "/api/tiff/upload",
                files={"file": (filename, content, "image/tiff")},
                headers=headers,
            )

    return asyncio.run(send_request())


def test_uploads_valid_tif_and_creates_a_temporary_file(tmp_path: Path) -> None:
    storage_dir = tmp_path / "isolated-uploads"
    app = make_app(storage_dir)
    content = make_tiff_bytes()

    response = upload(app, "sample.tif", content)

    assert response.status_code == 201
    body = response.json()
    assert body["filename"] == "sample.tif"
    file_id = UUID(body["file_id"])

    stored_upload = app.state.temporary_file_manager.get(file_id)
    assert stored_upload is not None
    assert stored_upload.path.parent == storage_dir
    assert stored_upload.path.exists()
    assert stored_upload.path.read_bytes() == content


def test_upload_response_contains_normalized_primary_series_metadata(
    tmp_path: Path,
) -> None:
    response = upload(
        make_app(tmp_path),
        "sample.ome.tif",
        make_tiff_bytes((2, 3, 4, 5, 7), "TZCYX", np.uint16),
    )

    assert response.status_code == 201
    assert response.json()["metadata"] == {
        "shape": [2, 3, 4, 5, 7],
        "axes": "TZCYX",
        "dtype": "uint16",
        "width": 7,
        "height": 5,
        "time_points": 2,
        "z_slices": 3,
        "channels": 4,
        "series_count": 1,
    }


def test_uploads_valid_tiff_extension(tmp_path: Path) -> None:
    response = upload(make_app(tmp_path), "sample.tiff", make_tiff_bytes())

    assert response.status_code == 201
    assert response.json()["filename"] == "sample.tiff"


def test_accepts_uppercase_tiff_extension(tmp_path: Path) -> None:
    response = upload(make_app(tmp_path), "SAMPLE.TIFF", make_tiff_bytes())

    assert response.status_code == 201


def test_rejects_an_invalid_extension_with_structured_error(
    tmp_path: Path,
) -> None:
    response = upload(make_app(tmp_path), "sample.png", make_tiff_bytes())

    assert response.status_code == 415
    assert response.json() == {
        "error": {
            "code": "INVALID_FILE_TYPE",
            "message": "Choose a TIFF file with a .tif or .tiff extension.",
        }
    }
    assert not tmp_path.exists() or list(tmp_path.iterdir()) == []


def test_accepts_a_file_at_the_configured_size_boundary(tmp_path: Path) -> None:
    content = make_tiff_bytes()
    response = upload(
        make_app(tmp_path, max_size=len(content)),
        "boundary.tif",
        content,
    )

    assert response.status_code == 201
    stored_files = list(tmp_path.iterdir())
    assert len(stored_files) == 1
    assert stored_files[0].stat().st_size == len(content)


def test_rejects_size_over_limit_and_removes_partial_file(tmp_path: Path) -> None:
    content = make_tiff_bytes()
    response = upload(
        make_app(tmp_path, max_size=len(content) - 1),
        "large.tif",
        content,
    )

    assert response.status_code == 413
    assert response.json()["error"]["code"] == "FILE_TOO_LARGE"
    assert list(tmp_path.iterdir()) == []


def test_uses_uuid_storage_name_instead_of_original_filename(tmp_path: Path) -> None:
    app = make_app(tmp_path)

    response = upload(app, "client-name.tif", make_tiff_bytes())

    file_id = UUID(response.json()["file_id"])
    stored_upload = app.state.temporary_file_manager.get(file_id)
    assert stored_upload is not None
    assert stored_upload.path.name == f"{file_id}.tif"
    assert "client-name" not in stored_upload.path.name


def test_strips_client_directory_from_display_filename(tmp_path: Path) -> None:
    response = upload(
        make_app(tmp_path),
        "..\\private\\sample.tif",
        make_tiff_bytes(),
    )

    assert response.status_code == 201
    assert response.json()["filename"] == "sample.tif"


def test_storage_failure_returns_a_safe_structured_error(tmp_path: Path) -> None:
    unusable_storage = tmp_path / "not-a-directory"
    unusable_storage.write_text("occupied", encoding="utf-8")
    app = make_app(unusable_storage)

    response = upload(app, "sample.tif", make_tiff_bytes())

    assert response.status_code == 500
    assert response.json() == {
        "error": {
            "code": "UPLOAD_FAILED",
            "message": "The TIFF file could not be uploaded. Please try again.",
        }
    }
    assert str(unusable_storage) not in response.text
    assert "Traceback" not in response.text


def test_invalid_tiff_returns_safe_error_and_removes_upload(tmp_path: Path) -> None:
    app = make_app(tmp_path)

    response = upload(app, "broken.tif", b"not a TIFF")

    assert response.status_code == 422
    assert response.json() == {
        "error": {
            "code": "INVALID_TIFF",
            "message": "The TIFF file could not be interpreted.",
        }
    }
    assert list(tmp_path.iterdir()) == []
    assert app.state.temporary_file_manager._uploads == {}
    assert str(tmp_path) not in response.text
    assert "Traceback" not in response.text


def test_unsupported_dtype_returns_safe_error_and_removes_upload(
    tmp_path: Path,
) -> None:
    app = make_app(tmp_path)

    response = upload(
        app,
        "uint32.tif",
        make_tiff_bytes(dtype=np.uint32),
    )

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "UNSUPPORTED_DTYPE"
    assert list(tmp_path.iterdir()) == []
    assert app.state.temporary_file_manager._uploads == {}


def test_ambiguous_axes_return_safe_error_and_remove_upload(tmp_path: Path) -> None:
    app = make_app(tmp_path)

    response = upload(
        app,
        "ambiguous.tif",
        make_tiff_bytes((2, 5, 7), axes=None),
    )

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "UNSUPPORTED_AXES"
    assert list(tmp_path.iterdir()) == []
    assert app.state.temporary_file_manager._uploads == {}


def test_missing_file_uses_structured_request_error(tmp_path: Path) -> None:
    app = make_app(tmp_path)

    async def send_request() -> httpx.Response:
        transport = httpx.ASGITransport(app=app, raise_app_exceptions=False)
        async with httpx.AsyncClient(
            transport=transport,
            base_url="http://testserver",
        ) as client:
            return await client.post("/api/tiff/upload")

    response = asyncio.run(send_request())

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "INVALID_REQUEST"


def test_allows_the_configured_local_frontend_origin(tmp_path: Path) -> None:
    response = upload(
        make_app(tmp_path),
        "sample.tif",
        make_tiff_bytes(),
        origin="http://localhost:5173",
    )

    assert response.headers["access-control-allow-origin"] == "http://localhost:5173"


def test_allows_upload_preflight_from_configured_origin(tmp_path: Path) -> None:
    app = make_app(tmp_path)

    async def send_preflight() -> httpx.Response:
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(
            transport=transport,
            base_url="http://testserver",
        ) as client:
            return await client.options(
                "/api/tiff/upload",
                headers={
                    "Origin": "http://localhost:5173",
                    "Access-Control-Request-Method": "POST",
                    "Access-Control-Request-Headers": "Content-Type",
                },
            )

    response = asyncio.run(send_preflight())

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "http://localhost:5173"
    assert "POST" in response.headers["access-control-allow-methods"]
