from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore", str_strip_whitespace=True)

    app_env: str = Field(default="local", alias="APP_ENV")
    log_level: str = Field(default="info", alias="LOG_LEVEL")
    database_url: str = Field(alias="DATABASE_URL")
    redis_url: str = Field(alias="REDIS_URL")
    s3_endpoint_url: str = Field(alias="S3_ENDPOINT_URL")
    s3_access_key_id: str = Field(alias="S3_ACCESS_KEY_ID")
    s3_secret_access_key: str = Field(alias="S3_SECRET_ACCESS_KEY")
    s3_bucket: str = Field(default="scraptheweb-local", alias="S3_BUCKET")
    s3_region: str = Field(default="us-east-1", alias="S3_REGION")
    frontend_origin: str = Field(default="http://localhost:3000", alias="FRONTEND_ORIGIN")
    render_result_timeout_seconds: int = Field(default=20, alias="RENDER_RESULT_TIMEOUT_SECONDS")
    page_session_ttl_seconds: int = Field(default=3600, alias="PAGE_SESSION_TTL_SECONDS")
    render_navigation_timeout_ms: int = Field(default=20000, alias="RENDER_NAVIGATION_TIMEOUT_MS")
    jwt_secret: str = Field(alias="JWT_SECRET")
    jwt_access_token_minutes: int = Field(default=15, alias="JWT_ACCESS_TOKEN_MINUTES")
    refresh_token_secret: str = Field(alias="REFRESH_TOKEN_SECRET")
    refresh_token_days: int = Field(default=30, alias="REFRESH_TOKEN_DAYS")
    render_rate_limit_per_hour: int = Field(default=30, alias="RENDER_RATE_LIMIT_PER_HOUR")
    recipe_run_rate_limit_per_hour: int = Field(default=20, alias="RECIPE_RUN_RATE_LIMIT_PER_HOUR")
    export_rate_limit_per_hour: int = Field(default=60, alias="EXPORT_RATE_LIMIT_PER_HOUR")
    org_render_quota_per_month: int = Field(default=200, alias="ORG_RENDER_QUOTA_PER_MONTH")
    org_recipe_run_quota_per_month: int = Field(
        default=100, alias="ORG_RECIPE_RUN_QUOTA_PER_MONTH"
    )
    org_export_quota_per_month: int = Field(default=500, alias="ORG_EXPORT_QUOTA_PER_MONTH")
    sentry_dsn: str | None = Field(default=None, alias="SENTRY_DSN")
    sentry_traces_sample_rate: float = Field(
        default=0.0, alias="SENTRY_TRACES_SAMPLE_RATE"
    )
    otel_exporter_otlp_endpoint: str | None = Field(
        default=None, alias="OTEL_EXPORTER_OTLP_ENDPOINT"
    )
    otel_console_exporter: bool = Field(default=False, alias="OTEL_CONSOLE_EXPORTER")
    otel_service_name_api: str = Field(
        default="scraptheweb-api", alias="OTEL_SERVICE_NAME_API"
    )
    otel_service_name_worker: str = Field(
        default="scraptheweb-worker", alias="OTEL_SERVICE_NAME_WORKER"
    )
    worker_metrics_port: int = Field(default=9100, alias="WORKER_METRICS_PORT")
    email_verification_token_hours: int = Field(
        default=48, alias="EMAIL_VERIFICATION_TOKEN_HOURS"
    )
    password_reset_token_minutes: int = Field(
        default=30, alias="PASSWORD_RESET_TOKEN_MINUTES"
    )
    require_email_verification: bool = Field(default=False, alias="REQUIRE_EMAIL_VERIFICATION")
    cors_allowed_origins: str = Field(
        default="http://localhost:3000", alias="CORS_ALLOWED_ORIGINS"
    )

    def cors_origins(self) -> list[str]:
        return [origin.strip() for origin in self.cors_allowed_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]
