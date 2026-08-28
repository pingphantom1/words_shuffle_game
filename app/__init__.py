"""
Application factory.
Creates and configures the Flask application instance.
"""
from flask import Flask
from flask_wtf.csrf import CSRFProtect

from .config import get_config
from .models import db

csrf = CSRFProtect()


def create_app(config_class=None) -> Flask:
    """Create and return a fully configured Flask application."""
    app = Flask(__name__, instance_relative_config=True)

    # Load configuration
    cfg = config_class or get_config()
    app.config.from_object(cfg)
    cfg.init_app(app)

    # Initialize extensions
    db.init_app(app)
    csrf.init_app(app)

    # Register blueprints
    from .blueprints.main import bp as main_bp
    from .blueprints.api import bp as api_bp

    app.register_blueprint(main_bp)
    app.register_blueprint(api_bp, url_prefix="/api")

    # Ensure all tables exist
    with app.app_context():
        db.create_all()

    return app
