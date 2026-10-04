import logging
from dataclasses import dataclass
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


def safe_display_filename(filename: str | None) -> str:
    """Remove any client-supplied directory portion from display metadata."""
    if not filename:
        return "upload"

    normalized = filename.replace("\\", "/")
    return PurePosixPath(normalized).name or "upload"


class TemporaryFileManager:
    """Store uploads under opaque IDs and retain lookup metadata in memory."""

    def __init__(self, storage_dir: Path, max_upload_size_bytes: int) -> None:
        self.storage_dir = storage_dir
        self.max_upload_size_bytes = max_upload_size_bytes
        self._uploads: dict[UUID, TemporaryUpload] = {}
        self._uploads_lock = Lock()

    def store_upload(self, upload: UploadFile) -> TemporaryUpload:
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
        with self._uploads_lock:
            return self._uploads.get(file_id)

    def remove(self, file_id: UUID) -> None:
        """Forget an upload and remove its temporary file if it exists."""
        with self._uploads_lock:
            upload = self._uploads.pop(file_id, None)

        if upload is None:
            return

        try:
            upload.path.unlink(missing_ok=True)
        except OSError:
            logger.exception("Could not remove a temporary upload")

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

    @staticmethod
    def _remove_partial_file(path: Path | None) -> None:
        if path is None:
            return

        try:
            path.unlink(missing_ok=True)
        except OSError:
            logger.exception("Could not remove a partial temporary upload")
