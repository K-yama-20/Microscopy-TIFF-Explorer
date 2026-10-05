from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.png_export import router as png_export_router
from app.api.preview import router as preview_router
from app.api.upload import router as upload_router
from app.api.zip_export import router as zip_export_router
from app.core.config import Settings
from app.models.errors import ApiServiceError
from app.models.health import HealthResponse
from app.services.temporary_files import TemporaryFileManager


def create_app(settings: Settings | None = None) -> FastAPI:
    resolved_settings = settings or Settings.from_environment()
    application = FastAPI(
        title="Microscopy TIFF Explorer API",
        version="0.1.0",
        description="Temporary processing API for microscopy TIFF files.",
    )
    application.state.settings = resolved_settings
    application.state.temporary_file_manager = TemporaryFileManager(
        storage_dir=resolved_settings.upload_storage_dir,
        max_upload_size_bytes=resolved_settings.max_upload_size_bytes,
    )

    application.add_middleware(
        CORSMiddleware,
        allow_origins=list(resolved_settings.allowed_origins),
        allow_credentials=False,
        allow_methods=["GET", "POST", "OPTIONS"],
        allow_headers=["Content-Type"],
        expose_headers=["Content-Disposition"],
    )

    @application.exception_handler(ApiServiceError)
    async def handle_upload_error(
        _request: Request, error: ApiServiceError
    ) -> JSONResponse:
        return JSONResponse(
            status_code=error.status_code,
            content={"error": {"code": error.code, "message": error.message}},
        )

    @application.exception_handler(RequestValidationError)
    async def handle_validation_error(
        _request: Request, _error: RequestValidationError
    ) -> JSONResponse:
        return JSONResponse(
            status_code=422,
            content={
                "error": {
                    "code": "INVALID_REQUEST",
                    "message": "A TIFF file is required for this request.",
                }
            },
        )

    application.include_router(upload_router)
    application.include_router(preview_router)
    application.include_router(png_export_router)
    application.include_router(zip_export_router)
    return application


app = create_app()


@app.get("/health", response_model=HealthResponse, tags=["system"])
async def health() -> HealthResponse:
    """Report whether the API process is ready to receive requests."""
    return HealthResponse(status="ok")
