import logging
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Query, Request, Response

from app.models.errors import (
    ApiServiceError,
    ErrorResponse,
    FileNotFoundError,
    ProcessingError,
)
from app.services.plane_rendering import render_tiff_plane_png
from app.services.temporary_files import TemporaryFileManager

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/tiff", tags=["tiff"])

MAX_PREVIEW_SIZE = 4096


@router.get(
    "/{file_id}/preview",
    responses={
        200: {"content": {"image/png": {}}, "description": "PNG preview."},
        404: {"model": ErrorResponse, "description": "Upload not found."},
        422: {"model": ErrorResponse, "description": "Invalid selection."},
        500: {"model": ErrorResponse, "description": "Preview processing failed."},
    },
)
def preview_tiff(
    file_id: str,
    request: Request,
    t: int = 0,
    z: int = 0,
    c: int = 0,
    component: str = "composite",
    max_size: Annotated[int | None, Query(ge=1, le=MAX_PREVIEW_SIZE)] = None,
) -> Response:
    """Extract, normalize, and encode one TIFF plane as an uncached PNG."""
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
                max_size=max_size,
            )
        except ApiServiceError:
            raise
        except Exception:
            logger.exception("TIFF preview processing failed")
            raise ProcessingError("The image preview could not be generated.") from None

    return Response(
        content=rendered.content,
        media_type="image/png",
        headers={
            "Cache-Control": "no-store, private",
            "Pragma": "no-cache",
            "X-Content-Type-Options": "nosniff",
        },
    )
