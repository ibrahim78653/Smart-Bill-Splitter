"""
Centralized error codes and user-facing messages.
Stack traces and internal details are NEVER exposed to the client.
"""
from enum import Enum

from fastapi import Request
from fastapi.responses import JSONResponse


class ErrorCode(str, Enum):
    # Upload & image errors
    UNSUPPORTED_FILE_TYPE = "UNSUPPORTED_FILE_TYPE"
    FILE_TOO_LARGE = "FILE_TOO_LARGE"
    INVALID_IMAGE = "INVALID_IMAGE"
    # Extraction errors
    EXTRACTION_FAILED = "EXTRACTION_FAILED"
    EXTRACTION_TIMEOUT = "EXTRACTION_TIMEOUT"
    API_QUOTA_EXCEEDED = "API_QUOTA_EXCEEDED"
    # Validation errors
    VALIDATION_ERROR = "VALIDATION_ERROR"
    # Calculation errors
    RECONCILIATION_MISMATCH = "RECONCILIATION_MISMATCH"
    ASSIGNMENT_INCOMPLETE = "ASSIGNMENT_INCOMPLETE"
    ASSIGNMENT_OVER_ALLOCATED = "ASSIGNMENT_OVER_ALLOCATED"
    ASSIGNMENT_UNDER_ALLOCATED = "ASSIGNMENT_UNDER_ALLOCATED"
    # State machine errors
    INVALID_STATE_TRANSITION = "INVALID_STATE_TRANSITION"
    BILL_NOT_CONFIRMED = "BILL_NOT_CONFIRMED"
    # Not found
    BILL_NOT_FOUND = "BILL_NOT_FOUND"
    # Generic
    INTERNAL_ERROR = "INTERNAL_ERROR"


USER_MESSAGES: dict[ErrorCode, str] = {
    ErrorCode.UNSUPPORTED_FILE_TYPE: "Please upload a JPG, PNG, or HEIC bill image.",
    ErrorCode.FILE_TOO_LARGE: "Your image is too large. Please use an image under 15 MB.",
    ErrorCode.INVALID_IMAGE: "The uploaded file doesn't appear to be a valid image.",
    ErrorCode.EXTRACTION_FAILED: (
        "We couldn't read this bill clearly. Try another photo with better lighting."
    ),
    ErrorCode.EXTRACTION_TIMEOUT: (
        "The extraction took too long. Please try again with a clearer photo."
    ),
    ErrorCode.API_QUOTA_EXCEEDED: (
        "Gemini API free tier quota exceeded. Please wait a moment or check your API key quota."
    ),
    ErrorCode.VALIDATION_ERROR: "The data provided is invalid. Please check and try again.",
    ErrorCode.RECONCILIATION_MISMATCH: (
        "We found a mismatch in the bill. Please review the highlighted values."
    ),
    ErrorCode.ASSIGNMENT_INCOMPLETE: (
        "Some items haven't been fully assigned. Please assign all quantities before continuing."
    ),
    ErrorCode.ASSIGNMENT_OVER_ALLOCATED: (
        "One or more items are over-allocated. Please check quantities."
    ),
    ErrorCode.ASSIGNMENT_UNDER_ALLOCATED: (
        "One or more items have unassigned quantity remaining."
    ),
    ErrorCode.INVALID_STATE_TRANSITION: (
        "This action isn't available at the current step. Please follow the bill workflow."
    ),
    ErrorCode.BILL_NOT_CONFIRMED: (
        "Please confirm the bill details before proceeding to assign items."
    ),
    ErrorCode.BILL_NOT_FOUND: "Bill not found.",
    ErrorCode.INTERNAL_ERROR: (
        "Something went wrong on our end. Please try again in a moment."
    ),
}


class AppError(Exception):
    """Base application error — carries an ErrorCode and optional detail for logging."""

    def __init__(
        self,
        code: ErrorCode,
        detail: str | None = None,
        status_code: int = 400,
    ) -> None:
        self.code = code
        self.detail = detail
        self.status_code = status_code
        super().__init__(detail or code.value)


async def app_error_handler(request: Request, exc: AppError) -> JSONResponse:
    import logging
    import uuid

    correlation_id = str(uuid.uuid4())
    logger = logging.getLogger("app.errors")
    logger.error(
        "AppError [%s] code=%s detail=%s path=%s",
        correlation_id,
        exc.code,
        exc.detail,
        request.url.path,
    )
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "error_code": exc.code.value,
            "message": USER_MESSAGES.get(exc.code, USER_MESSAGES[ErrorCode.INTERNAL_ERROR]),
            "correlation_id": correlation_id,
        },
    )


async def generic_error_handler(request: Request, exc: Exception) -> JSONResponse:
    import logging
    import uuid

    correlation_id = str(uuid.uuid4())
    logger = logging.getLogger("app.errors")
    logger.exception("Unhandled error [%s] path=%s", correlation_id, request.url.path)
    return JSONResponse(
        status_code=500,
        content={
            "error_code": ErrorCode.INTERNAL_ERROR.value,
            "message": USER_MESSAGES[ErrorCode.INTERNAL_ERROR],
            "correlation_id": correlation_id,
        },
    )
