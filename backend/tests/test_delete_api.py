import asyncio
from datetime import UTC, datetime, timedelta
from io import BytesIO
from pathlib import Path
from uuid import UUID, uuid4

import httpx
import numpy as np
import tifffile

from app.core.config import Settings
from app.main import create_app
from app.services.temporary_files import TemporaryFileManager


class MutableClock:
    def __init__(self, now: datetime) -> None:
        self.now = now

    def __call__(self) -> datetime:
        return self.now

    def advance(self, **kwargs: float) -> None:
        self.now += timedelta(**kwargs)


def make_tiff_bytes(offset: int = 0) -> bytes:
    output = BytesIO()
    pixels = np.arange(35, dtype=np.uint8).reshape(5, 7) + offset
    tifffile.imwrite(output, pixels)
    return output.getvalue()


def make_app(tmp_path: Path, clock: MutableClock | None = None):
    app = create_app(
        Settings(
            temp_storage_dir=tmp_path,
            temp_file_ttl_minutes=30,
            allowed_origins=("http://localhost:5173",),
        )
    )
    if clock is not None:
        app.state.temporary_file_manager = TemporaryFileManager(
            tmp_path,
            100 * 1024 * 1024,
            ttl_minutes=30,
            clock=clock,
        )
    return app


async def upload(client: httpx.AsyncClient, name: str, offset: int = 0) -> str:
    response = await client.post(
        "/api/tiff/upload",
        files={"file": (name, make_tiff_bytes(offset), "image/tiff")},
    )
    assert response.status_code == 201
    return response.json()["file_id"]


def test_delete_is_eager_idempotent_and_isolated(tmp_path: Path) -> None:
    app = make_app(tmp_path)

    async def exercise() -> tuple[UUID, UUID, list[httpx.Response]]:
        transport = httpx.ASGITransport(app=app, raise_app_exceptions=False)
        async with httpx.AsyncClient(
            transport=transport, base_url="http://testserver"
        ) as client:
            first = await upload(client, "first.tif")
            second = await upload(client, "second.tif", offset=1)
            responses = [
                await client.delete(f"/api/tiff/{first}"),
                await client.delete(f"/api/tiff/{first}"),
                await client.delete(f"/api/tiff/{uuid4()}"),
                await client.get(f"/api/tiff/{second}/preview"),
            ]
            return UUID(first), UUID(second), responses

    first, second, responses = asyncio.run(exercise())
    manager: TemporaryFileManager = app.state.temporary_file_manager

    assert [response.status_code for response in responses] == [204, 204, 204, 200]
    assert manager.get(first) is None
    assert manager.get(second) is not None
    assert len(list(tmp_path.iterdir())) == 1


def test_delete_rejects_an_invalid_uuid_without_exposing_details(
    tmp_path: Path,
) -> None:
    app = make_app(tmp_path)

    async def exercise() -> httpx.Response:
        transport = httpx.ASGITransport(app=app, raise_app_exceptions=False)
        async with httpx.AsyncClient(
            transport=transport, base_url="http://testserver"
        ) as client:
            return await client.delete("/api/tiff/not-a-uuid")

    response = asyncio.run(exercise())

    assert response.status_code == 404
    assert response.json() == {
        "error": {
            "code": "FILE_NOT_FOUND",
            "message": "The temporary TIFF file could not be found.",
        }
    }


def test_deleted_file_is_missing_for_all_processing_endpoints(tmp_path: Path) -> None:
    app = make_app(tmp_path)

    async def exercise() -> list[httpx.Response]:
        transport = httpx.ASGITransport(app=app, raise_app_exceptions=False)
        async with httpx.AsyncClient(
            transport=transport, base_url="http://testserver"
        ) as client:
            file_id = await upload(client, "deleted.tif")
            assert (await client.delete(f"/api/tiff/{file_id}")).status_code == 204
            item = {
                "file_id": file_id,
                "t": 0,
                "z": 0,
                "c": 0,
                "component": "composite",
            }
            return [
                await client.get(f"/api/tiff/{file_id}/preview"),
                await client.get(f"/api/tiff/{file_id}/export/png"),
                await client.get(f"/api/tiff/{file_id}/export/zip"),
                await client.post("/api/exports/selection", json={"items": [item]}),
            ]

    responses = asyncio.run(exercise())

    assert all(response.status_code == 404 for response in responses)
    assert all(
        response.json()["error"]["code"] == "FILE_NOT_FOUND" for response in responses
    )


def test_delete_during_active_lease_defers_physical_removal(tmp_path: Path) -> None:
    app = make_app(tmp_path)

    async def create_upload() -> UUID:
        transport = httpx.ASGITransport(app=app, raise_app_exceptions=False)
        async with httpx.AsyncClient(
            transport=transport, base_url="http://testserver"
        ) as client:
            return UUID(await upload(client, "leased.tif"))

    async def delete_upload(file_id: UUID) -> httpx.Response:
        transport = httpx.ASGITransport(app=app, raise_app_exceptions=False)
        async with httpx.AsyncClient(
            transport=transport, base_url="http://testserver"
        ) as client:
            return await client.delete(f"/api/tiff/{file_id}")

    file_id = asyncio.run(create_upload())
    manager: TemporaryFileManager = app.state.temporary_file_manager
    stored = manager.get(file_id)
    assert stored is not None

    with manager.acquire(file_id) as leased:
        assert leased == stored
        response = asyncio.run(delete_upload(file_id))
        assert response.status_code == 204
        assert stored.path.exists()
        with manager.acquire(file_id) as unavailable:
            assert unavailable is None

    assert not stored.path.exists()
    assert manager.get(file_id) is None


def test_delete_and_ttl_cleanup_can_target_the_same_lease(tmp_path: Path) -> None:
    clock = MutableClock(datetime(2026, 1, 1, tzinfo=UTC))
    app = make_app(tmp_path, clock)

    async def create_upload() -> UUID:
        transport = httpx.ASGITransport(app=app, raise_app_exceptions=False)
        async with httpx.AsyncClient(
            transport=transport, base_url="http://testserver"
        ) as client:
            return UUID(await upload(client, "race.tif"))

    file_id = asyncio.run(create_upload())
    manager: TemporaryFileManager = app.state.temporary_file_manager
    stored = manager.get(file_id)
    assert stored is not None

    with manager.acquire(file_id):
        clock.advance(minutes=31)
        assert manager.cleanup_expired() == 0
        manager.remove(file_id)
        manager.remove(file_id)
        assert stored.path.exists()

    assert not stored.path.exists()
    assert manager.cleanup_expired() == 0


def test_delete_of_an_expired_id_is_safe(tmp_path: Path) -> None:
    clock = MutableClock(datetime(2026, 1, 1, tzinfo=UTC))
    app = make_app(tmp_path, clock)

    async def exercise() -> httpx.Response:
        transport = httpx.ASGITransport(app=app, raise_app_exceptions=False)
        async with httpx.AsyncClient(
            transport=transport, base_url="http://testserver"
        ) as client:
            file_id = await upload(client, "expired.tif")
            clock.advance(minutes=31)
            return await client.delete(f"/api/tiff/{file_id}")

    response = asyncio.run(exercise())

    assert response.status_code == 204
    assert list(tmp_path.iterdir()) == []


def test_delete_is_allowed_by_browser_cors_policy(tmp_path: Path) -> None:
    app = make_app(tmp_path)

    async def exercise() -> httpx.Response:
        transport = httpx.ASGITransport(app=app, raise_app_exceptions=False)
        async with httpx.AsyncClient(
            transport=transport, base_url="http://testserver"
        ) as client:
            return await client.options(
                f"/api/tiff/{uuid4()}",
                headers={
                    "Origin": "http://localhost:5173",
                    "Access-Control-Request-Method": "DELETE",
                },
            )

    response = asyncio.run(exercise())

    assert response.status_code == 200
    assert "DELETE" in response.headers["access-control-allow-methods"]
