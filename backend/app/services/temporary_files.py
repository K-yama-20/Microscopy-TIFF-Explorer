import logging
from collections.abc import Callable, Iterator
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from pathlib import Path, PurePosixPath
from threading import Lock
from typing import BinaryIO
from uuid import UUID, uuid4

from fastapi import UploadFile

from app.models.errors import ApiServiceError

logger = logging.getLogger(__name__)

TIFF_EXTENSIONS = {".tif", ".tiff"}
UPLOAD_CHUNK_SIZE_BYTES = 1024 * 1024


class InvalidFileTypeError(ApiServiceError):
    def __init__(self) -> None:
        super().__init__(
            code="INVALID_FILE_TYPE",
            message="Choose a TIFF file with a .tif or .tiff extension.",
            status_code=415,
        )


class FileTooLargeError(ApiServiceError):
    def __init__(self) -> None:
        super().__init__(
            code="FILE_TOO_LARGE",
            message="The TIFF file exceeds the maximum allowed size.",
            status_code=413,
        )


class UploadStorageError(ApiServiceError):
    def __init__(self) -> None:
        super().__init__(
            code="UPLOAD_FAILED",
            message="The TIFF file could not be uploaded. Please try again.",
            status_code=500,
        )


@dataclass(frozen=True, slots=True)
class TemporaryUpload:
    file_id: UUID
    filename: str
    path: Path
    size_bytes: int
    created_at: datetime


def safe_display_filename(filename: str | None) -> str:
    """Remove any client-supplied directory portion from display metadata."""
    if not filename:
        return "upload"

    normalized = filename.replace("\\", "/")
    return PurePosixPath(normalized).name or "upload"


class TemporaryFileManager:
    """Store uploads under opaque IDs and retain lookup metadata in memory."""

    def __init__(
        self,
        storage_dir: Path,
        max_upload_size_bytes: int,
        ttl_minutes: float = 30,
        clock: Callable[[], datetime] | None = None,
    ) -> None:
        if ttl_minutes <= 0:
            raise ValueError("ttl_minutes must be greater than zero")
        self.storage_dir = storage_dir
        self.max_upload_size_bytes = max_upload_size_bytes
        self.ttl = timedelta(minutes=ttl_minutes)
        self._clock = clock or (lambda: datetime.now(UTC))
        self._uploads: dict[UUID, TemporaryUpload] = {}
        self._active_uses: dict[UUID, int] = {}
        self._expired_uploads: set[UUID] = set()
        self._uploads_lock = Lock()
        self._cleanup_orphaned_uploads()

    def store_upload(self, upload: UploadFile) -> TemporaryUpload:
        self.cleanup_expired()
        filename = safe_display_filename(upload.filename)
        extension = Path(filename).suffix.lower()
        if extension not in TIFF_EXTENSIONS:
            raise InvalidFileTypeError

        destination: Path | None = None
        try:
            self.storage_dir.mkdir(parents=True, exist_ok=True)
            file_id, destination, destination_file = self._create_destination(extension)
            try:
                size_bytes = self._copy_with_size_limit(upload.file, destination_file)
            finally:
                destination_file.close()

            temporary_upload = TemporaryUpload(
                file_id=file_id,
                filename=filename,
                path=destination,
                size_bytes=size_bytes,
                created_at=self._now(),
            )
            with self._uploads_lock:
                self._uploads[file_id] = temporary_upload
            return temporary_upload
        except ApiServiceError:
            self._remove_partial_file(destination)
            raise
        except Exception:
            self._remove_partial_file(destination)
            logger.exception("Temporary upload storage failed")
            raise UploadStorageError from None

    def get(self, file_id: UUID) -> TemporaryUpload | None:
        """Return current metadata for diagnostics; processing must use acquire()."""
        self.cleanup_expired()
        with self._uploads_lock:
            if file_id in self._expired_uploads:
                return None
            return self._uploads.get(file_id)

    @contextmanager
    def acquire(self, file_id: UUID) -> Iterator[TemporaryUpload | None]:
        """Lease an upload so concurrent cleanup cannot delete it mid-processing."""
        self.cleanup_expired()
        with self._uploads_lock:
            upload = self._uploads.get(file_id)
            if upload is None or file_id in self._expired_uploads:
                upload = None
            else:
                self._active_uses[file_id] = self._active_uses.get(file_id, 0) + 1

        if upload is None:
            yield None
            return

        try:
            yield upload
        finally:
            path_to_remove: Path | None = None
            with self._uploads_lock:
                remaining = self._active_uses.get(file_id, 1) - 1
                if remaining > 0:
                    self._active_uses[file_id] = remaining
                else:
                    self._active_uses.pop(file_id, None)
                    if file_id in self._expired_uploads:
                        expired_upload = self._uploads.pop(file_id, None)
                        self._expired_uploads.discard(file_id)
                        path_to_remove = (
                            expired_upload.path if expired_upload is not None else None
                        )
            self._remove_managed_file(path_to_remove)

    def cleanup_expired(self) -> int:
        """Expire in-memory records and remove files that are not currently leased."""
        now = self._now()
        paths_to_remove: list[Path] = []
        with self._uploads_lock:
            for file_id, upload in tuple(self._uploads.items()):
                if now - upload.created_at < self.ttl:
                    continue
                self._expired_uploads.add(file_id)
                if self._active_uses.get(file_id, 0) == 0:
                    self._uploads.pop(file_id, None)
                    self._expired_uploads.discard(file_id)
                    paths_to_remove.append(upload.path)

        for path in paths_to_remove:
            self._remove_managed_file(path)
        return len(paths_to_remove)

    def remove(self, file_id: UUID) -> None:
        """Forget an upload and remove its temporary file if it exists."""
        path_to_remove: Path | None = None
        with self._uploads_lock:
            upload = self._uploads.get(file_id)
            if upload is not None and self._active_uses.get(file_id, 0) > 0:
                self._expired_uploads.add(file_id)
            else:
                upload = self._uploads.pop(file_id, None)
                self._expired_uploads.discard(file_id)
                path_to_remove = upload.path if upload is not None else None
        self._remove_managed_file(path_to_remove)

    def _create_destination(self, extension: str) -> tuple[UUID, Path, BinaryIO]:
        for _ in range(3):
            file_id = uuid4()
            destination = self.storage_dir / f"{file_id}{extension}"
            try:
                return file_id, destination, destination.open("xb")
            except FileExistsError:
                continue

        raise UploadStorageError

    def _copy_with_size_limit(self, source: BinaryIO, destination: BinaryIO) -> int:
        size_bytes = 0
        while chunk := source.read(UPLOAD_CHUNK_SIZE_BYTES):
            size_bytes += len(chunk)
            if size_bytes > self.max_upload_size_bytes:
                raise FileTooLargeError
            destination.write(chunk)

        return size_bytes

    def _now(self) -> datetime:
        now = self._clock()
        if now.tzinfo is None:
            return now.replace(tzinfo=UTC)
        return now.astimezone(UTC)

    def _cleanup_orphaned_uploads(self) -> None:
        """Remove expired UUID-named TIFFs left by an earlier process."""
        try:
            self.storage_dir.mkdir(parents=True, exist_ok=True)
            candidates = tuple(self.storage_dir.iterdir())
        except OSError:
            logger.exception("Could not inspect temporary upload storage")
            return

        cutoff = self._now() - self.ttl
        for path in candidates:
            try:
                if not self._is_managed_upload_path(path):
                    continue
                modified_at = datetime.fromtimestamp(path.stat().st_mtime, tz=UTC)
                if modified_at <= cutoff:
                    path.unlink(missing_ok=True)
                    logger.info("Removed an expired orphaned temporary upload")
            except OSError:
                logger.exception("Could not remove an orphaned temporary upload")

    @staticmethod
    def _is_managed_upload_path(path: Path) -> bool:
        if not path.is_file() or path.suffix.lower() not in TIFF_EXTENSIONS:
            return False
        try:
            UUID(path.stem)
        except ValueError:
            return False
        return True

    @staticmethod
    def _remove_managed_file(path: Path | None) -> None:
        if path is None:
            return
        try:
            path.unlink(missing_ok=True)
        except OSError:
            logger.exception("Could not remove a temporary upload")

    @staticmethod
    def _remove_partial_file(path: Path | None) -> None:
        if path is None:
            return

        try:
            path.unlink(missing_ok=True)
        except OSError:
            logger.exception("Could not remove a partial temporary upload")
