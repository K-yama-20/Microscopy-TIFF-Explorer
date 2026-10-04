import logging
from uuid import UUID

import tifffile
from fastapi import APIRouter, Request, Response

from app.models.errors import ApiServiceError, ErrorResponse
from app.services.normalization import normalize_to_uint8
from app.services.plane_extraction import extract_plane, validate_plane_selection
from app.services.png_encoding import encode_png
from app.services.temporary_files import TemporaryFileManager

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/tiff", tags=["tiff"])


class FileNotFoundError(ApiServiceError):
    def __init__(self) -> None:
        super().__init__(
            code="FILE_NOT_FOUND",
            message="The temporary TIFF file could not be found.",
            status_code=404,
        )


class ProcessingError(ApiServiceError):
    def __init__(self) -> None:
        super().__init__(
            code="PROCESSING_ERROR",
            message="The image preview could not be generated.",
            status_code=500,
        )


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
) -> Response:
    """Extract, normalize, and encode one TIFF plane as an uncached PNG."""
    try:
        parsed_file_id = UUID(file_id)
    except ValueError:
        raise FileNotFoundError from None

    manager: TemporaryFileManager = request.app.state.temporary_file_manager
    upload = manager.get(parsed_file_id)
    if upload is None or not upload.path.is_file():
        raise FileNotFoundError

    try:
        with tifffile.TiffFile(upload.path) as tif:
            if not tif.series:
                raise ProcessingError
            series = tif.series[0]
            axes = series.axes or ""
            selected_component = validate_plane_selection(
                tuple(int(size) for size in series.shape),
                axes,
                t=t,
                z=z,
                c=c,
                component=component,
            )
            array = series.asarray()

        plane = extract_plane(
            array,
            axes,
            t=t,
            z=z,
            c=c,
            component=selected_component,
        )
        normalized = normalize_to_uint8(plane)
        png = encode_png(normalized)
    except ApiServiceError:
        raise
    except Exception:
        logger.exception("TIFF preview processing failed")
        raise ProcessingError from None

    return Response(
        content=png,
        media_type="image/png",
        headers={
            "Cache-Control": "no-store, private",
            "Pragma": "no-cache",
            "X-Content-Type-Options": "nosniff",
        },
    )
