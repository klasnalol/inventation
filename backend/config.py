import os

class Config:
    JWT_SECRET_KEY = os.environ.get("JWT_SECRET_KEY", "change-me")
    SQLALCHEMY_DATABASE_URI = os.environ.get("DATABASE_URL", "sqlite:///app.db")
    SQLALCHEMY_ECHO = False
    UPLOAD_DIR = os.environ.get("UPLOAD_DIR", os.path.abspath("uploads"))
    TEMPLATE_DIR = os.environ.get("TEMPLATE_DIR", os.path.abspath("templates"))
