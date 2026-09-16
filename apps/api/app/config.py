from pydantic_settings import BaseSettings
from typing import Optional

class Settings(BaseSettings):
    PROJECT_NAME: str = "Shiksha Academy API"
    VERSION: str = "1.1.0"
    API_V1_STR: str = "/api/v1"
    ENVIRONMENT: str = "development"
    
    # Security
    SECRET_KEY: str = "shiksha-academy-super-secret-key-change-in-production-2026"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 15
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7
    OFFLINE_SESSION_MAX_DAYS: int = 7

    # CORS Allowed Origins (Comma separated string or wildcard)
    CORS_ORIGINS: str = "*"

    # Database (Default to SQLite for local lightweight testing / dev, replaceable with PostgreSQL)
    DATABASE_URL: str = "sqlite:///./shiksha_academy.db"

    class Config:
        env_file = ".env"
        case_sensitive = True

settings = Settings()

if settings.ENVIRONMENT.lower() == "production":
    if settings.SECRET_KEY == "shiksha-academy-super-secret-key-change-in-production-2026":
        raise ValueError("PRODUCTION DEPLOYMENT ERROR: Insecure default SECRET_KEY detected! Set a secure SECRET_KEY environment variable.")

