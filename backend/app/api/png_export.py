import logging
from uuid import UUID

from fastapi import APIRouter, Request, Response

from app.models.errors import (
    ApiServiceError,
    ErrorResponse,
    FileNotFoundError,
    ProcessingError,
)
from app.services.export_filenames import build_png_export_filename
from app.services.plane_rendering import render_tiff_plane_png
from app.services.temporary_files import TemporaryFileManager

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/tiff", tags=["tiff"])


@router.get(
    "/{file_id}/export/png",
    responses={
        200: {"content": {"image/png": {}}, "description": "PNG download."},
        404: {"model": ErrorResponse, "description": "Upload not found."},
        422: {"model": ErrorResponse, "description": "Invalid selection."},
        500: {"model": ErrorResponse, "description": "PNG export failed."},
    },
)
def export_tiff_png(
    file_id: str,
    request: Request,
    t: int = 0,
    z: int = 0,
    c: int = 0,
    component: str = "composite",
) -> Response:
    """Return one TIFF selection as an in-memory PNG attachment."""
    try:
        parsed_file_id = UUID(file_id)
    except ValueError:
        raise FileNotFoundError from None

    manager: TemporaryFileManager = request.app.state.temporary_file_manager
    with manager.acquire(parsed_file_id) as upload:
        if upload is None or not upload.path.is_file():
            raise FileNotFoundError

        try:
            rendered = render_tiff_plane_png(
                upload.path,
                t=t,
                z=z,
                c=c,
                component=component,
            )
            filename = build_png_export_filename(
                upload.filename,
                t=t,
                z=z,
                c=c,
                component=rendered.component,
                is_rgb=rendered.is_rgb,
            )
        except ApiServiceError:
            raise
        except Exception:
            logger.exception("TIFF PNG export processing failed")
            raise ProcessingError("The PNG export could not be generated.") from None

    return Response(
        content=rendered.content,
        media_type="image/png",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Cache-Control": "no-store, private",
            "Pragma": "no-cache",
            "X-Content-Type-Options": "nosniff",
        },
    )
