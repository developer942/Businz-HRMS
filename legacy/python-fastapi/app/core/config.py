import os
from functools import lru_cache


def _comma_list(value: str | None) -> list[str]:
    if not value:
        return []
    return [item.strip() for item in value.split(",") if item.strip()]


class Settings:
    """Runtime configuration. Supersedes every hardcoded default via environment."""

    APP_NAME: str = os.getenv("APP_NAME", "ApexHRMS Backend")
    API_V1_PREFIX: str = os.getenv("API_V1_PREFIX", "/api/v1")

    DATABASE_URL: str = os.getenv("DATABASE_URL", "sqlite:///./hrm_backend.db")

    JWT_SECRET: str = os.getenv("JWT_SECRET", "vrm-hrms-dev-secret-change-in-production")
    JWT_ALGORITHM: str = os.getenv("JWT_ALGORITHM", "HS256")
    JWT_ACCESS_TOKEN_MINUTES: int = int(os.getenv("JWT_ACCESS_TOKEN_MINUTES", "480"))

    # Comma separated list of origins. "*" enables wide-open CORS (dev only).
    CORS_ORIGINS: list[str] = _comma_list(os.getenv("CORS_ORIGINS", "*"))

    # Role keys that bypass the permission matrix (e.g. CEO / Super Admin).
    FULL_ACCESS_ROLE_KEYS: list[str] = _comma_list(os.getenv("FULL_ACCESS_ROLE_KEYS", "CEO"))

    # Role keys whose row-level access is restricted to their own employee record.
    SELF_SERVICE_ROLE_KEYS: list[str] = _comma_list(os.getenv("SELF_SERVICE_ROLE_KEYS", "EMPLOYEE"))

    # Demo seed data is opt-in only. Keep disabled for production deployments.
    ENABLE_DEMO_SEED: bool = os.getenv("ENABLE_DEMO_SEED", "false").lower() == "true"


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
