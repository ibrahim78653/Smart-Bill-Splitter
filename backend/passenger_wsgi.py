"""
passenger_wsgi.py — Entry point for Hostinger / cPanel Phusion Passenger WSGI.
Translates ASGI FastAPI application to WSGI via a2wsgi.
"""
import os
import sys

# Ensure backend directory is on Python path
CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
if CURRENT_DIR not in sys.path:
    sys.path.insert(0, CURRENT_DIR)

try:
    from a2wsgi import ASGIMiddleware
    from app.main import app

    # Wrap ASGI app into WSGI application for Passenger
    application = ASGIMiddleware(app)

except Exception as exc:
    # Diagnostic fallback in case of configuration errors on Hostinger
    def application(environ, start_response):
        status = "500 Internal Server Error"
        error_msg = (
            f"Smart Bill Splitter Backend Startup Error:\n\n{type(exc).__name__}: {str(exc)}\n\n"
            "Please check:\n"
            "1. All dependencies in requirements.txt are installed (pip install -r requirements.txt)\n"
            "2. .env file exists with valid GEMINI_API_KEY and MONGODB_URI\n"
        ).encode("utf-8")
        response_headers = [
            ("Content-Type", "text/plain; charset=utf-8"),
            ("Content-Length", str(len(error_msg))),
        ]
        start_response(status, response_headers)
        return [error_msg]
