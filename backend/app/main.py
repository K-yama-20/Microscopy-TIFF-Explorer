from fastapi import FastAPI

from app.models.health import HealthResponse

app = FastAPI(
    title="Microscopy TIFF Explorer API",
    version="0.1.0",
    description="Temporary processing API for microscopy TIFF files.",
)


@app.get("/health", response_model=HealthResponse, tags=["system"])
async def health() -> HealthResponse:
    """Report whether the API process is ready to receive requests."""
    return HealthResponse(status="ok")
