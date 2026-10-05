import logging
from uuid import UUID

from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse
from starlette.background import BackgroundTask

from app.models.errors import (
    ApiServiceError,
    ErrorResponse,
    FileNotFoundError,
    ProcessingError,
)
from app.services.export_filenames import build_zip_export_filename
from app.services.temporary_files import TemporaryFileManager
from app.services.zip_export import build_tiff_zip_archive, stream_archive

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/tiff", tags=["tiff"])


@router.get(
    "/{file_id}/export/zip",
    responses={
        200: {"content": {"application/zip": {}}, "description": "ZIP download."},
        404: {"model": ErrorResponse, "description": "Upload not found."},
        422: {"model": ErrorResponse, "description": "Invalid component."},
        500: {"model": ErrorResponse, "description": "ZIP export failed."},
    },
)
def export_tiff_zip(
    file_id: str,
    request: Request,
    component: str = "composite",
) -> StreamingResponse:
    """Return all primary-series T/Z/C planes as a temporary ZIP archive."""
    try:
        parsed_file_id = UUID(file_id)
    except ValueError:
        raise FileNotFoundError from None

    manager: TemporaryFileManager = request.app.state.temporary_file_manager
    archive = None
    with manager.acquire(parsed_file_id) as upload:
        if upload is None or not upload.path.is_file():
            raise FileNotFoundError

        try:
            archive, selected_component, is_rgb = build_tiff_zip_archive(
                upload.path,
                upload.filename,
                component=component,
            )
            filename = build_zip_export_filename(
                upload.filename,
                component=selected_component,
                is_rgb=is_rgb,
            )
        except ApiServiceError:
            if archive is not None:
                archive.close()
            raise
        except Exception:
            if archive is not None:
                archive.close()
            logger.exception("TIFF ZIP export processing failed")
            raise ProcessingError("The ZIP export could not be generated.") from None

    return StreamingResponse(
        stream_archive(archive),
        media_type="application/zip",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Cache-Control": "no-store, private",
            "Pragma": "no-cache",
            "X-Content-Type-Options": "nosniff",
        },
        background=BackgroundTask(archive.close),
    )
