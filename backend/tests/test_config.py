import pytest

from app.core.config import DEFAULT_TEMP_FILE_TTL_MINUTES, Settings


def test_default_temporary_file_ttl_is_30_minutes(monkeypatch) -> None:
    monkeypatch.delenv("TEMP_FILE_TTL_MINUTES", raising=False)

    settings = Settings.from_environment()

    assert DEFAULT_TEMP_FILE_TTL_MINUTES == 30
    assert settings.temp_file_ttl_minutes == 30


@pytest.mark.parametrize("value", ["0", "-1", "not-a-number", "nan", "inf"])
def test_rejects_invalid_temporary_file_ttl(monkeypatch, value: str) -> None:
    monkeypatch.setenv("TEMP_FILE_TTL_MINUTES", value)

    with pytest.raises(ValueError, match="TEMP_FILE_TTL_MINUTES"):
        Settings.from_environment()


def test_accepts_positive_fractional_ttl_for_deterministic_testing(monkeypatch) -> None:
    monkeypatch.setenv("TEMP_FILE_TTL_MINUTES", "0.5")

    assert Settings.from_environment().temp_file_ttl_minutes == 0.5


def test_normalizes_configured_origins_without_trailing_slashes(monkeypatch) -> None:
    monkeypatch.setenv(
        "ALLOWED_ORIGINS",
        "https://example.vercel.app/, http://localhost:5173/",
    )

    assert Settings.from_environment().allowed_origins == (
        "https://example.vercel.app",
        "http://localhost:5173",
    )


def test_rejects_wildcard_cors_origin(monkeypatch) -> None:
    monkeypatch.setenv("ALLOWED_ORIGINS", "*")

    with pytest.raises(ValueError, match="wildcard"):
        Settings.from_environment()
