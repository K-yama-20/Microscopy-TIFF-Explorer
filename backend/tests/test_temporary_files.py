import asyncio
import os
from datetime import UTC, datetime, timedelta
from io import BytesIO
from pathlib import Path
from uuid import UUID, uuid4

import httpx
import numpy as np
import tifffile
from fastapi import UploadFile

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


def store(manager: TemporaryFileManager, name: str = "sample.tif"):
    return manager.store_upload(UploadFile(file=BytesIO(b"TIFF"), filename=name))


def make_tiff_bytes() -> bytes:
    output = BytesIO()
    tifffile.imwrite(output, np.arange(35, dtype=np.uint8).reshape(5, 7))
    return output.getvalue()


def test_cleanup_expires_record_and_file_with_injected_clock(tmp_path: Path) -> None:
    clock = MutableClock(datetime(2026, 1, 1, tzinfo=UTC))
    manager = TemporaryFileManager(tmp_path, 1024, ttl_minutes=30, clock=clock)
    upload = store(manager)

    clock.advance(minutes=29, seconds=59)
    assert manager.cleanup_expired() == 0
    assert manager.get(upload.file_id) == upload

    clock.advance(seconds=1)
    assert manager.cleanup_expired() == 1
    assert manager.get(upload.file_id) is None
    assert not upload.path.exists()


def test_active_lease_prevents_mid_request_deletion(tmp_path: Path) -> None:
    clock = MutableClock(datetime(2026, 1, 1, tzinfo=UTC))
    manager = TemporaryFileManager(tmp_path, 1024, ttl_minutes=30, clock=clock)
    upload = store(manager)

    with manager.acquire(upload.file_id) as acquired:
        assert acquired == upload
        clock.advance(minutes=31)
        assert manager.cleanup_expired() == 0
        assert upload.path.exists()
        with manager.acquire(upload.file_id) as expired:
            assert expired is None
        assert upload.path.exists()

    assert not upload.path.exists()
    assert manager.get(upload.file_id) is None


def test_startup_only_removes_expired_uuid_named_tiffs(tmp_path: Path) -> None:
    now = datetime(2026, 1, 1, tzinfo=UTC)
    old_tif = tmp_path / f"{uuid4()}.tif"
    old_tiff = tmp_path / f"{uuid4()}.tiff"
    unrelated_tif = tmp_path / "research-data.tif"
    unrelated_text = tmp_path / f"{uuid4()}.txt"
    fresh_tif = tmp_path / f"{uuid4()}.tif"
    for path in (old_tif, old_tiff, unrelated_tif, unrelated_text, fresh_tif):
        path.write_bytes(b"data")
    old_timestamp = (now - timedelta(minutes=31)).timestamp()
    for path in (old_tif, old_tiff, unrelated_tif, unrelated_text):
        os.utime(path, (old_timestamp, old_timestamp))
    fresh_timestamp = (now - timedelta(minutes=1)).timestamp()
    os.utime(fresh_tif, (fresh_timestamp, fresh_timestamp))

    TemporaryFileManager(
        tmp_path,
        1024,
        ttl_minutes=30,
        clock=MutableClock(now),
    )

    assert not old_tif.exists()
    assert not old_tiff.exists()
    assert unrelated_tif.exists()
    assert unrelated_text.exists()
    assert fresh_tif.exists()


def test_expired_file_id_is_missing_for_preview_png_and_zip(tmp_path: Path) -> None:
    clock = MutableClock(datetime(2026, 1, 1, tzinfo=UTC))
    app = create_app(
        Settings(
            temp_storage_dir=tmp_path,
            temp_file_ttl_minutes=30,
            allowed_origins=("http://localhost:5173",),
        )
    )
    manager = TemporaryFileManager(
        tmp_path,
        1024 * 1024,
        ttl_minutes=30,
        clock=clock,
    )
    app.state.temporary_file_manager = manager

    async def exercise_api() -> tuple[UUID, list[httpx.Response]]:
        transport = httpx.ASGITransport(app=app, raise_app_exceptions=False)
        async with httpx.AsyncClient(
            transport=transport,
            base_url="http://testserver",
        ) as client:
            uploaded = await client.post(
                "/api/tiff/upload",
                files={"file": ("sample.tif", make_tiff_bytes(), "image/tiff")},
            )
            file_id = UUID(uploaded.json()["file_id"])
            clock.advance(minutes=31)
            responses = [
                await client.get(f"/api/tiff/{file_id}/preview"),
                await client.get(f"/api/tiff/{file_id}/export/png"),
                await client.get(f"/api/tiff/{file_id}/export/zip"),
            ]
            return file_id, responses

    file_id, responses = asyncio.run(exercise_api())

    assert all(response.status_code == 404 for response in responses)
    assert all(
        response.json()["error"]["code"] == "FILE_NOT_FOUND" for response in responses
    )
    assert manager.get(file_id) is None
    assert list(tmp_path.iterdir()) == []
