import logging
from typing import BinaryIO

from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse
from starlette.background import BackgroundTask

from app.models.errors import ApiServiceError, ErrorResponse, ProcessingError
from app.models.selection_export import SelectionExportRequest
from app.services.selection_export import (
    SELECTION_ARCHIVE_FILENAME,
    build_selection_zip_archive,
)
from app.services.temporary_files import TemporaryFileManager
from app.services.zip_export import stream_archive

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/exports", tags=["exports"])


def _archive_size(archive: BinaryIO) -> int:
    archive.seek(0, 2)
    size = archive.tell()
    archive.seek(0)
    return size


@router.post(
    "/selection",
    responses={
        200: {"content": {"application/zip": {}}, "description": "Selected ZIP."},
        404: {"model": ErrorResponse, "description": "Upload not found."},
        422: {"model": ErrorResponse, "description": "Invalid selection batch."},
        500: {"model": ErrorResponse, "description": "ZIP export failed."},
    },
)
def export_selection_zip(
    payload: SelectionExportRequest,
    request: Request,
) -> StreamingResponse:
    """Return an atomic ZIP containing exactly the requested selections."""
    manager: TemporaryFileManager = request.app.state.temporary_file_manager
    archive = None
    try:
        archive = build_selection_zip_archive(manager, payload.items)
        content_length = _archive_size(archive)
        return StreamingResponse(
            stream_archive(archive),
            media_type="application/zip",
            headers={
                "Content-Disposition": (
                    f'attachment; filename="{SELECTION_ARCHIVE_FILENAME}"'
                ),
                "Content-Length": str(content_length),
                "Cache-Control": "no-store, private",
                "Pragma": "no-cache",
                "X-Content-Type-Options": "nosniff",
            },
            background=BackgroundTask(archive.close),
        )
    except ApiServiceError:
        if archive is not None:
            archive.close()
        raise
    except Exception:
        if archive is not None:
            archive.close()
        logger.exception("Selected-image ZIP export processing failed")
        raise ProcessingError(
            "The selected-image ZIP export could not be generated."
        ) from None
