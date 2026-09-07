"""
image_service.py — Image preprocessing pipeline.

Each function is independent and testable.
Original uploads are NEVER modified — all processing produces new bytes.
"""
import io
import math
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageEnhance, ImageFilter

from app.core.errors import AppError, ErrorCode


# ── Quality checks ────────────────────────────────────────────────────────────

def compute_blur_score(image_bytes: bytes) -> float:
    """
    Variance of Laplacian blur score.
    Higher = sharper. Threshold ~100 for useful bill photos.
    """
    img = _to_cv2_gray(image_bytes)
    score = float(cv2.Laplacian(img, cv2.CV_64F).var())
    return score


def compute_brightness(image_bytes: bytes) -> dict[str, float]:
    """Returns mean and std of pixel brightness (0–255)."""
    img = _to_cv2_gray(image_bytes)
    mean, std = cv2.meanStdDev(img)
    return {"mean": float(mean[0][0]), "std": float(std[0][0])}


def estimate_tilt_angle(image_bytes: bytes) -> float:
    """
    Estimate dominant text tilt angle using Hough lines.
    Returns angle in degrees (0 = straight).
    """
    img = _to_cv2_gray(image_bytes)
    edges = cv2.Canny(img, 50, 150, apertureSize=3)
    lines = cv2.HoughLines(edges, 1, np.pi / 180, 200)
    if lines is None:
        return 0.0
    angles = []
    for rho, theta in lines[:, 0]:
        angle = math.degrees(theta) - 90
        if abs(angle) < 45:
            angles.append(angle)
    if not angles:
        return 0.0
    return float(np.median(angles))


def assess_quality(image_bytes: bytes) -> list[str]:
    """
    Return a list of quality warnings (empty = good quality).
    Never blocks processing — just attaches warnings.
    """
    warnings = []
    blur = compute_blur_score(image_bytes)
    if blur < 80:
        warnings.append(
            "This photo looks blurry — extraction may be less accurate. "
            "Try holding the camera still."
        )
    brightness = compute_brightness(image_bytes)
    if brightness["mean"] < 60:
        warnings.append(
            "This photo looks a bit dark — extraction may be less accurate. "
            "Try taking the photo in better lighting."
        )
    elif brightness["mean"] > 220:
        warnings.append(
            "This photo looks overexposed — try reducing glare or flash."
        )
    tilt = abs(estimate_tilt_angle(image_bytes))
    if tilt > 15:
        warnings.append(
            f"This photo appears tilted ({tilt:.0f}°) — straightening may improve accuracy."
        )
    return warnings


# ── Enhancement pipeline ──────────────────────────────────────────────────────

def deskew(image_bytes: bytes) -> bytes:
    """Rotate image to correct estimated tilt angle."""
    angle = estimate_tilt_angle(image_bytes)
    if abs(angle) < 0.5:
        return image_bytes
    img = _to_pil(image_bytes)
    corrected = img.rotate(-angle, expand=True, fillcolor=(255, 255, 255))
    return _pil_to_bytes(corrected)


def enhance_contrast(image_bytes: bytes) -> bytes:
    """Apply CLAHE (Contrast Limited Adaptive Histogram Equalization) for text contrast."""
    img = _to_cv2_gray(image_bytes)
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    enhanced = clahe.apply(img)
    # Convert back to RGB PNG
    rgb = cv2.cvtColor(enhanced, cv2.COLOR_GRAY2RGB)
    _, buf = cv2.imencode(".png", rgb)
    return bytes(buf)


def denoise(image_bytes: bytes) -> bytes:
    """Apply Non-local Means Denoising."""
    img = _to_cv2_color(image_bytes)
    denoised = cv2.fastNlMeansDenoisingColored(img, None, 10, 10, 7, 21)
    _, buf = cv2.imencode(".png", denoised)
    return bytes(buf)


def sharpen(image_bytes: bytes) -> bytes:
    """Unsharp mask sharpening via PIL."""
    img = _to_pil(image_bytes)
    sharpened = img.filter(ImageFilter.UnsharpMask(radius=1, percent=150, threshold=3))
    return _pil_to_bytes(sharpened)


def preprocess_image(image_bytes: bytes) -> tuple[bytes, list[str]]:
    """
    Full preprocessing pipeline: assess → deskew → contrast → denoise → sharpen.
    Returns (processed_bytes, quality_warnings).
    Original bytes are unchanged.
    """
    warnings = assess_quality(image_bytes)
    processed = deskew(image_bytes)
    processed = enhance_contrast(processed)
    processed = denoise(processed)
    processed = sharpen(processed)
    return processed, warnings


def validate_image_bytes(data: bytes) -> None:
    """Validate that bytes represent a decodable image."""
    try:
        img = Image.open(io.BytesIO(data))
        img.verify()
    except Exception as e:
        raise AppError(ErrorCode.INVALID_IMAGE, detail=str(e))


# ── Internal helpers ──────────────────────────────────────────────────────────

def _to_cv2_gray(image_bytes: bytes) -> np.ndarray:
    arr = np.frombuffer(image_bytes, dtype=np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_GRAYSCALE)
    if img is None:
        # Fallback via PIL
        pil = Image.open(io.BytesIO(image_bytes)).convert("L")
        img = np.array(pil)
    return img


def _to_cv2_color(image_bytes: bytes) -> np.ndarray:
    arr = np.frombuffer(image_bytes, dtype=np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if img is None:
        pil = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        img = cv2.cvtColor(np.array(pil), cv2.COLOR_RGB2BGR)
    return img


def _to_pil(image_bytes: bytes) -> Image.Image:
    return Image.open(io.BytesIO(image_bytes)).convert("RGB")


def _pil_to_bytes(img: Image.Image) -> bytes:
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()
