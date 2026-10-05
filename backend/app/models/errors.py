from pydantic import BaseModel


class ApiServiceError(Exception):
    """Base class for safe, structured errors returned by the API."""

    def __init__(self, code: str, message: str, status_code: int) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.status_code = status_code


class FileNotFoundError(ApiServiceError):
    def __init__(self) -> None:
        super().__init__(
            code="FILE_NOT_FOUND",
            message="The temporary TIFF file could not be found.",
            status_code=404,
        )


class ErrorDetail(BaseModel):
    code: str
    message: str


class ErrorResponse(BaseModel):
    error: ErrorDetail
