"""File security validation helpers."""
import hashlib
import os
import re
from pathlib import Path

from app.core.errors import AppError, ErrorCode

ALLOWED_MIME_TYPES = {"image/jpeg", "image/png", "image/heic", "image/heif"}
ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".heic", ".heif"}


def validate_filename(filename: str) -> str:
    """Sanitize filename to prevent path traversal attacks."""
    # Strip any path components
    basename = Path(filename).name
    # Remove any characters that aren't safe
    safe = re.sub(r"[^a-zA-Z0-9._\-]", "_", basename)
    if not safe or safe.startswith("."):
        safe = "upload" + safe
    return safe


def validate_file_extension(filename: str) -> None:
    ext = Path(filename).suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise AppError(ErrorCode.UNSUPPORTED_FILE_TYPE, f"Extension {ext!r} not allowed")


def validate_file_size(size_bytes: int, max_mb: int = 15) -> None:
    max_bytes = max_mb * 1024 * 1024
    if size_bytes > max_bytes:
        raise AppError(
            ErrorCode.FILE_TOO_LARGE,
            f"File size {size_bytes} exceeds max {max_bytes}",
        )


def compute_image_hash(data: bytes) -> str:
    """SHA-256 hash for idempotency deduplication of Gemini calls."""
    return hashlib.sha256(data).hexdigest()
