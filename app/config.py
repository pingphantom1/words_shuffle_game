"""
Application configuration classes.
Values are loaded from environment variables via python-dotenv.
"""
import os
from dotenv import load_dotenv

load_dotenv()


class Config:
    """Base configuration shared by all environments."""

    # Security — must be set via .env; never hardcode
    SECRET_KEY: str = os.environ.get("SECRET_KEY") or "change-me-in-production"

    # SQLAlchemy
    SQLALCHEMY_TRACK_MODIFICATIONS: bool = False
    SQLALCHEMY_DATABASE_URI: str = os.environ.get(
        "DATABASE_URL",
        "sqlite:///wordshufflegame.db",
    )

    # WTF CSRF
    WTF_CSRF_ENABLED: bool = True

    # Ensure the instance folder exists at config time
    @staticmethod
    def init_app(app) -> None:  # type: ignore[no-untyped-def]
        os.makedirs(app.instance_path, exist_ok=True)


class DevelopmentConfig(Config):
    DEBUG: bool = True
    SQLALCHEMY_ECHO: bool = False  # set True to log SQL queries


class ProductionConfig(Config):
    DEBUG: bool = False
    WTF_CSRF_SSL_STRICT: bool = True


class TestingConfig(Config):
    TESTING: bool = True
    WTF_CSRF_ENABLED: bool = False
    SQLALCHEMY_DATABASE_URI: str = "sqlite:///:memory:"


_config_map = {
    "development": DevelopmentConfig,
    "production": ProductionConfig,
    "testing": TestingConfig,
}


def get_config() -> type[Config]:
    env = os.environ.get("FLASK_ENV", "development").lower()
    return _config_map.get(env, DevelopmentConfig)
