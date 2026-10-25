"""Secure local file storage: type sniffing, size limits, metadata stripping."""
from __future__ import annotations

import io
import secrets
from pathlib import Path

from .. import config, db
from ..errors import ApiError

ALLOWED = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "application/pdf": ".pdf",
    "audio/webm": ".webm",
    "audio/ogg": ".ogg",
    "audio/mpeg": ".mp3",
    "audio/wav": ".wav",
    "audio/mp4": ".m4a",
}
PURPOSES = {"need_photo", "evidence", "verification", "update", "audio", "impact"}
# visibility: public (anyone may view once the project is public), team (project
# owner, accepted supporters, reviewers), reviewers (owner + reviewers only)
VISIBILITIES = {"public", "team", "reviewers"}


def sniff_mime(data: bytes) -> str | None:
    if data.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp"
    if data[:4] == b"RIFF" and data[8:12] == b"WAVE":
        return "audio/wav"
    if data.startswith(b"%PDF-"):
        return "application/pdf"
    if data.startswith(b"\x1a\x45\xdf\xa3"):
        return "audio/webm"
    if data.startswith(b"OggS"):
        return "audio/ogg"
    if data.startswith(b"ID3") or data[:2] in (b"\xff\xfb", b"\xff\xf3", b"\xff\xf2"):
        return "audio/mpeg"
    if data[4:8] == b"ftyp":
        return "audio/mp4"
    return None


def _strip_metadata(data: bytes, mime: str) -> bytes:
    """Re-encode images to drop EXIF (including GPS location) when Pillow is available."""
    if not mime.startswith("image/"):
        return data
    try:
        from PIL import Image, ImageOps
    except ImportError:
        return data
    try:
        img = Image.open(io.BytesIO(data))
        img = ImageOps.exif_transpose(img)
        img.thumbnail((2400, 2400))
        out = io.BytesIO()
        fmt = {"image/jpeg": "JPEG", "image/png": "PNG", "image/webp": "WEBP"}[mime]
        if fmt == "JPEG" and img.mode not in ("RGB", "L"):
            img = img.convert("RGB")
        img.save(out, format=fmt, quality=88)
        return out.getvalue()
    except Exception:
        raise ApiError(422, "The image could not be read. Please upload a valid JPG, PNG or WebP.")


def save_upload(*, data: bytes, filename: str, owner_id: str, purpose: str, visibility: str,
                project_id: str | None = None, org_id: str | None = None, consent: bool = False) -> dict:
    limit = config.settings.max_upload_mb * 1024 * 1024
    if not data:
        raise ApiError(422, "The file is empty.")
    if len(data) > limit:
        raise ApiError(413, f"Files must be {config.settings.max_upload_mb} MB or smaller.")
    if purpose not in PURPOSES:
        raise ApiError(422, "Unknown upload purpose.", field="purpose")
    if visibility not in VISIBILITIES:
        raise ApiError(422, "Unknown visibility.", field="visibility")
    mime = sniff_mime(data)
    if mime not in ALLOWED:
        raise ApiError(415, "Unsupported file type. Use JPG, PNG, WebP, PDF or a common audio format.")
    if purpose == "audio" and not mime.startswith("audio/"):
        raise ApiError(415, "Please upload an audio recording.")
    if purpose != "audio" and mime.startswith("audio/"):
        raise ApiError(415, "Audio files can only be uploaded for transcription.")
    data = _strip_metadata(data, mime)
    stored = secrets.token_hex(16) + ALLOWED[mime]
    path = Path(config.settings.upload_dir) / stored
    path.write_bytes(data)
    safe_name = "".join(ch for ch in (filename or "file") if ch.isalnum() or ch in "._- ")[:120] or "file"
    row = {
        "id": db.new_id(), "owner_id": owner_id, "project_id": project_id, "org_id": org_id,
        "original_name": safe_name, "stored_name": stored, "mime": mime, "size": len(data),
        "purpose": purpose, "visibility": visibility, "consent_confirmed": int(consent),
        "created_at": db.now(),
    }
    db.insert("files", row)
    return row


def file_path(row: dict) -> Path:
    return Path(config.settings.upload_dir) / row["stored_name"]


def public_file(row: dict) -> dict:
    return {k: row[k] for k in ("id", "original_name", "mime", "size", "purpose", "visibility", "created_at")} | {
        "url": f"/api/files/{row['id']}"}
