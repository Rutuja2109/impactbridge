"""File uploads/downloads and AI assistance endpoints."""
from __future__ import annotations

from starlette.requests import Request
from starlette.responses import FileResponse
from starlette.routing import Route

from .. import config, db
from ..errors import ApiError
from ..models import ImproveStoryIn, StructureIn
from ..security import current_user, require_user
from ..services import ai, storage
from ..services import projects as P
from ..services.notify import audit
from ..web import ok, parse


async def upload(request: Request):
    user = require_user(request)
    if "multipart/form-data" not in request.headers.get("content-type", ""):
        raise ApiError(415, "Upload files using multipart/form-data.")
    form = await request.form(max_files=1, max_fields=10)
    up = form.get("file")
    if up is None or not hasattr(up, "read"):
        raise ApiError(422, "Choose a file to upload.", field="file")
    data = await up.read()
    purpose = str(form.get("purpose") or "evidence")
    visibility = str(form.get("visibility") or "team")
    project_id = str(form.get("project_id") or "") or None
    org_id = str(form.get("org_id") or "") or None
    consent = str(form.get("consent") or "").lower() in ("1", "true", "yes", "on")
    if project_id:
        p = P.get_or_404(project_id)
        if not (P.is_manager(user, p) or P.is_supporter(user, p)):
            raise ApiError(403, "Only the project team can upload files to this project.")
        if visibility == "public" and (p["involves_children"] or p["involves_vulnerable"]) and not consent:
            raise ApiError(422, "This project involves children or vulnerable people. Confirm you have consent "
                                "before making a photo public, or choose team-only visibility.", field="consent")
    if org_id and P.org_role(user["id"], org_id) is None:
        raise ApiError(403, "You are not a member of this organization.")
    if purpose == "verification" and visibility != "reviewers":
        visibility = "reviewers"  # identity / financial documents are never public
    row = storage.save_upload(data=data, filename=getattr(up, "filename", "file"), owner_id=user["id"],
                              purpose=purpose, visibility=visibility, project_id=project_id, org_id=org_id,
                              consent=consent)
    audit(user["id"], "file.uploaded", "project" if project_id else "file", project_id or row["id"],
          file=row["id"], purpose=purpose, visibility=visibility)
    return ok({"file": storage.public_file(row)}, 201)


async def download(request: Request):
    user = current_user(request)
    f = db.get("files", request.path_params["fid"])
    if not f or not P.can_view_file(user, f):
        raise ApiError(404, "File not found.")
    path = storage.file_path(f)
    if not path.exists():
        raise ApiError(404, "File not found.")
    disposition = "inline" if f["mime"].startswith("image/") or f["mime"] == "application/pdf" else "attachment"
    headers = {"Cache-Control": "private, max-age=3600", "X-Content-Type-Options": "nosniff",
               "Content-Security-Policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'"}
    return FileResponse(path, media_type=f["mime"], filename=f["original_name"], headers=headers,
                        content_disposition_type=disposition)


async def delete_file(request: Request):
    user = require_user(request)
    f = db.get("files", request.path_params["fid"])
    if not f or f["owner_id"] != user["id"]:
        raise ApiError(404, "File not found.")
    if f["project_id"]:
        p = db.get("projects", f["project_id"])
        if p and p["status"] in ("completed", "verified"):
            raise ApiError(409, "Evidence on completed projects is kept for the audit trail.")
    storage.file_path(f).unlink(missing_ok=True)
    db.execute("DELETE FROM files WHERE id = ?", (f["id"],))
    audit(user["id"], "file.deleted", "file", f["id"])
    return ok()


async def structure(request: Request):
    user = require_user(request)
    data = await parse(request, StructureIn)
    images = []
    for fid in data.photo_file_ids:
        f = db.get("files", fid)
        if not f or f["owner_id"] != user["id"] or not f["mime"].startswith("image/"):
            raise ApiError(422, "A photo could not be found. Please upload it again.", field="photo_file_ids")
        images.append((f["mime"], storage.file_path(f).read_bytes()))
    proposal = ai.structure_need(data.description, data.city, data.region, data.cause, images, data.language)
    audit(user["id"], "ai.structured_need", "user", user["id"], provider=proposal.get("provider"),
          removed=proposal.get("removed_unstated_values"))
    return ok({"proposal": proposal, "original_description": data.description})


async def improve_story(request: Request):
    user = require_user(request)
    data = await parse(request, ImproveStoryIn)
    if not (data.problem_statement or data.story):
        raise ApiError(422, "Describe the problem first, then we can help you tell it better.", field="story")
    out = ai.improve_story(data.model_dump(), data.language if data.language in ("en", "hi", "mr") else "en")
    audit(user["id"], "ai.improved_story", "user", user["id"], provider=out.get("provider"))
    return ok({"suggestion": out})


async def transcribe(request: Request):
    user = require_user(request)
    if "multipart/form-data" not in request.headers.get("content-type", ""):
        raise ApiError(415, "Send the recording as multipart/form-data.")
    form = await request.form(max_files=1, max_fields=2)
    up = form.get("file")
    if up is None or not hasattr(up, "read"):
        raise ApiError(422, "No recording received.")
    audio = await up.read()
    if len(audio) > 24 * 1024 * 1024:
        raise ApiError(413, "Recordings must be under 24 MB (about 20 minutes).")
    mime = storage.sniff_mime(audio)
    if not mime or not mime.startswith("audio/"):
        raise ApiError(415, "Unsupported recording format.")
    lang = form.get("language") if form.get("language") in ("en", "hi", "mr") else None
    text = ai.transcribe(audio, mime, lang)  # audio is not stored
    audit(user["id"], "ai.transcribed", "user", user["id"], bytes=len(audio))
    return ok({"text": text})


async def integrations(request: Request):
    return ok({"integrations": config.settings.integrations()})


routes = [
    Route("/api/files", upload, methods=["POST"]),
    Route("/api/files/{fid}", download, methods=["GET"]),
    Route("/api/files/{fid}", delete_file, methods=["DELETE"]),
    Route("/api/ai/structure", structure, methods=["POST"]),
    Route("/api/ai/improve-story", improve_story, methods=["POST"]),
    Route("/api/ai/transcribe", transcribe, methods=["POST"]),
    Route("/api/integrations", integrations, methods=["GET"]),
]
