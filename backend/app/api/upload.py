from uuid import UUID

from fastapi import APIRouter, Request, Response, UploadFile

from app.models.errors import ErrorResponse, FileNotFoundError
from app.models.upload import UploadResponse
from app.services.temporary_files import TemporaryFileManager
from app.services.tiff_metadata import parse_tiff_metadata

router = APIRouter(prefix="/api/tiff", tags=["tiff"])


@router.post(
    "/upload",
    response_model=UploadResponse,
    status_code=201,
    responses={
        413: {
            "model": ErrorResponse,
            "description": "The uploaded file is too large.",
        },
        415: {
            "model": ErrorResponse,
            "description": "The uploaded file does not have a TIFF extension.",
        },
        422: {
            "model": ErrorResponse,
            "description": "The TIFF content or metadata is unsupported.",
        },
        500: {"model": ErrorResponse, "description": "The upload could not be stored."},
    },
)
def upload_tiff(file: UploadFile, request: Request) -> UploadResponse:
    """Validate and copy a TIFF upload into server-controlled temporary storage."""
    manager: TemporaryFileManager = request.app.state.temporary_file_manager
    stored_upload = None
    try:
        stored_upload = manager.store_upload(file)
        try:
            metadata = parse_tiff_metadata(stored_upload.path)
        except Exception:
            manager.remove(stored_upload.file_id)
            raise
    finally:
        file.file.close()

    return UploadResponse(
        file_id=str(stored_upload.file_id),
        filename=stored_upload.filename,
        metadata=metadata,
    )


@router.delete(
    "/{file_id}",
    status_code=204,
    responses={
        204: {"description": "The temporary upload is no longer available."},
        404: {"model": ErrorResponse, "description": "Invalid upload ID."},
    },
)
def delete_tiff(file_id: str, request: Request) -> Response:
    """Make an upload unavailable and remove it when its final lease ends."""
    try:
        parsed_file_id = UUID(file_id)
    except ValueError:
        raise FileNotFoundError from None

    manager: TemporaryFileManager = request.app.state.temporary_file_manager
    manager.remove(parsed_file_id)
    return Response(status_code=204)
