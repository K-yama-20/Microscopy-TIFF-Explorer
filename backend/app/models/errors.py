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


class ProcessingError(ApiServiceError):
    def __init__(self, message: str) -> None:
        super().__init__(
            code="PROCESSING_ERROR",
            message=message,
            status_code=500,
        )


class EmptySelectionError(ApiServiceError):
    def __init__(self) -> None:
        super().__init__(
            code="EMPTY_SELECTION",
            message="Choose at least one image to export.",
            status_code=422,
        )


class BatchLimitExceededError(ApiServiceError):
    def __init__(self) -> None:
        super().__init__(
            code="BATCH_LIMIT_EXCEEDED",
            message="The selected export exceeds the allowed batch limits.",
            status_code=422,
        )


class DuplicateSelectionError(ApiServiceError):
    def __init__(self) -> None:
        super().__init__(
            code="DUPLICATE_SELECTION",
            message="The selected export contains a duplicate image.",
            status_code=422,
        )


class ErrorDetail(BaseModel):
    code: str
    message: str


class ErrorResponse(BaseModel):
    error: ErrorDetail
