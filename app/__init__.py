from flask import Flask
from app.routes import main


def create_app():
    app = Flask(__name__)

    # Register Blueprints
    app.register_blueprint(main)

    return app
