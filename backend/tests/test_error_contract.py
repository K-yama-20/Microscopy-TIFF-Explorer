import asyncio
from pathlib import Path

import httpx

from app.core.config import Settings
from app.main import create_app


def make_app(tmp_path: Path):
    return create_app(
        Settings(
            temp_storage_dir=tmp_path,
            allowed_origins=("http://localhost:5173",),
        )
    )


def request(app, path: str) -> httpx.Response:
    async def send() -> httpx.Response:
        transport = httpx.ASGITransport(app=app, raise_app_exceptions=False)
        async with httpx.AsyncClient(
            transport=transport,
            base_url="http://testserver",
        ) as client:
            return await client.get(path)

    return asyncio.run(send())


def test_invalid_query_uses_general_safe_request_error(tmp_path: Path) -> None:
    response = request(
        make_app(tmp_path),
        f"/api/tiff/{'0' * 32}/preview?t=not-an-integer",
    )

    assert response.status_code == 422
    assert response.json() == {
        "error": {
            "code": "INVALID_REQUEST",
            "message": "The request contains invalid or missing parameters.",
        }
    }


def test_unknown_api_route_uses_structured_error(tmp_path: Path) -> None:
    response = request(make_app(tmp_path), "/api/unknown")

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "INVALID_REQUEST"


def test_unexpected_exception_does_not_expose_internals(tmp_path: Path) -> None:
    app = make_app(tmp_path)

    @app.get("/api/test-unexpected-error")
    def fail_safely():
        raise RuntimeError(f"secret path: {tmp_path}")

    response = request(app, "/api/test-unexpected-error")

    assert response.status_code == 500
    assert response.json()["error"]["code"] == "PROCESSING_ERROR"
    assert str(tmp_path) not in response.text
    assert "RuntimeError" not in response.text
