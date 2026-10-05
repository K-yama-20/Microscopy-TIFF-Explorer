import os
import tempfile
from dataclasses import dataclass
from math import isfinite
from pathlib import Path

DEFAULT_MAX_UPLOAD_SIZE_MB = 100
DEFAULT_TEMP_FILE_TTL_MINUTES = 30
DEFAULT_ALLOWED_ORIGINS = ("http://localhost:5173", "http://127.0.0.1:5173")


@dataclass(frozen=True, slots=True)
class Settings:
    """Runtime settings for upload storage and browser access."""

    max_upload_size_bytes: int = DEFAULT_MAX_UPLOAD_SIZE_MB * 1024 * 1024
    temp_file_ttl_minutes: float = DEFAULT_TEMP_FILE_TTL_MINUTES
    temp_storage_dir: Path | None = None
    allowed_origins: tuple[str, ...] = DEFAULT_ALLOWED_ORIGINS

    @property
    def upload_storage_dir(self) -> Path:
        if self.temp_storage_dir is not None:
            return self.temp_storage_dir

        return Path(tempfile.gettempdir()) / "microscopy-tiff-explorer"

    @classmethod
    def from_environment(cls) -> "Settings":
        try:
            max_size_mb = int(
                os.environ.get("MAX_UPLOAD_SIZE_MB", DEFAULT_MAX_UPLOAD_SIZE_MB)
            )
        except ValueError:
            raise ValueError("MAX_UPLOAD_SIZE_MB must be a positive integer.") from None
        if max_size_mb <= 0:
            raise ValueError("MAX_UPLOAD_SIZE_MB must be greater than zero.")

        try:
            temp_file_ttl_minutes = float(
                os.environ.get("TEMP_FILE_TTL_MINUTES", DEFAULT_TEMP_FILE_TTL_MINUTES)
            )
        except ValueError:
            raise ValueError(
                "TEMP_FILE_TTL_MINUTES must be a positive number."
            ) from None
        if not isfinite(temp_file_ttl_minutes) or temp_file_ttl_minutes <= 0:
            raise ValueError("TEMP_FILE_TTL_MINUTES must be greater than zero.")

        configured_temp_dir = os.environ.get("TEMP_STORAGE_DIR")
        temp_storage_dir = (
            Path(configured_temp_dir).expanduser() if configured_temp_dir else None
        )

        configured_origins = os.environ.get("ALLOWED_ORIGINS")
        if configured_origins is None:
            allowed_origins = DEFAULT_ALLOWED_ORIGINS
        else:
            allowed_origins = tuple(
                origin.strip().rstrip("/")
                for origin in configured_origins.split(",")
                if origin.strip()
            )
            if not allowed_origins:
                raise ValueError("ALLOWED_ORIGINS must contain at least one origin.")
            if "*" in allowed_origins:
                raise ValueError("ALLOWED_ORIGINS must not use a wildcard origin.")

        return cls(
            max_upload_size_bytes=max_size_mb * 1024 * 1024,
            temp_file_ttl_minutes=temp_file_ttl_minutes,
            temp_storage_dir=temp_storage_dir,
            allowed_origins=allowed_origins,
        )
