"""ImpactBridge web application (API + static frontend)."""
from __future__ import annotations

import asyncio
import html
import logging
import mimetypes
from contextlib import asynccontextmanager
from pathlib import Path

from starlette.applications import Starlette
from starlette.exceptions import HTTPException
from starlette.middleware import Middleware
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.middleware.gzip import GZipMiddleware
from starlette.requests import Request
from starlette.responses import FileResponse, HTMLResponse, JSONResponse, PlainTextResponse, Response
from starlette.routing import Mount, Route
from starlette.staticfiles import StaticFiles

from . import config, db
from .domain import PUBLIC_STATUSES
from .errors import ApiError
from .routes import account, auth, coordination, safety, commitments, files_ai, misc, orgs, projects, trust
from .security import hash_password
from .services.notify import sweep_deadlines

log = logging.getLogger("impactbridge")

# Windows can map .js to text/plain in its registry, which makes browsers refuse to run the app's
# JavaScript modules (the page stays on "Loading"). Register the correct types explicitly.
for _ext, _type in ((".js", "text/javascript"), (".mjs", "text/javascript"), (".css", "text/css"),
                    (".svg", "image/svg+xml"), (".webmanifest", "application/manifest+json"),
                    (".json", "application/json"), (".png", "image/png"), (".woff2", "font/woff2")):
    mimetypes.add_type(_type, _ext)


def bootstrap_admin() -> None:
    s = config.settings
    if not (s.admin_email and s.admin_password):
        return
    email = s.admin_email.strip().lower()
    if db.one("SELECT id FROM users WHERE email = ?", (email,)):
        return
    ts = db.now()
    db.insert("users", {"id": db.new_id(), "email": email, "password_hash": hash_password(s.admin_password),
                        "name": "Administrator", "role": "admin", "skills": "[]", "created_at": ts, "updated_at": ts})
    log.info("Created administrator account %s", email)


async def _deadline_loop():
    while True:
        try:
            sweep_deadlines()
        except Exception as exc:  # keep the loop alive
            log.warning("Deadline sweep failed: %s", exc)
        await asyncio.sleep(3600)


@asynccontextmanager
async def lifespan(app):
    db.init_db()
    bootstrap_admin()
    task = asyncio.create_task(_deadline_loop())
    try:
        yield
    finally:
        task.cancel()


class SecurityHeaders(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response: Response = await call_next(request)
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("X-Frame-Options", "DENY")
        response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
        response.headers.setdefault("Permissions-Policy", "camera=(self), microphone=(self), geolocation=()")
        if not request.url.path.startswith("/api/files/"):
            response.headers.setdefault(
                "Content-Security-Policy",
                "default-src 'self'; img-src 'self' data: blob:; media-src 'self' blob:; style-src 'self' "
                "https://fonts.googleapis.com 'unsafe-inline'; font-src 'self' https://fonts.gstatic.com; "
                "script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'")
        if request.url.path.startswith("/api/") and "Cache-Control" not in response.headers:
            response.headers["Cache-Control"] = "no-store"
        return response


async def api_error(request: Request, exc: ApiError):
    return JSONResponse(exc.to_dict(), status_code=exc.status)


async def http_error(request: Request, exc: HTTPException):
    if request.url.path.startswith("/api/"):
        return JSONResponse({"error": exc.detail or "Request failed"}, status_code=exc.status_code)
    return await spa(request)


async def server_error(request: Request, exc: Exception):
    log.exception("Unhandled error", exc_info=exc)
    return JSONResponse({"error": "Something went wrong on our side. Please try again."}, status_code=500)


# ------------------------------------------------------------ SPA & SEO ---
def _index_html() -> str:
    return (Path(config.settings.frontend_dir) / "index.html").read_text()


async def spa(request: Request):
    path = request.url.path
    if path.startswith("/api/"):
        return JSONResponse({"error": "Not found"}, status_code=404)
    page = _index_html()
    title = "ImpactBridge — Turn community problems into collective action"
    desc = ("ImpactBridge connects real community needs with Rotary and Rotaract clubs, NGOs, CSR teams and "
            "volunteers who can help — from verified need to measured impact.")
    if path.startswith("/projects/"):
        pid = path.split("/")[2] if len(path.split("/")) > 2 else ""
        p = db.get("projects", pid) if pid else None
        if p and not p["is_hidden"] and p["status"] in PUBLIC_STATUSES:
            title = f"{p['title']} — ImpactBridge"
            desc = (p["problem_statement"] or desc)[:160]
    page = page.replace("__TITLE__", html.escape(title)).replace("__DESCRIPTION__", html.escape(desc))
    page = page.replace("__CANONICAL__", html.escape(config.settings.public_url + path))
    return HTMLResponse(page)


async def robots(request: Request):
    base = config.settings.public_url
    return PlainTextResponse(f"User-agent: *\nDisallow: /api/\nDisallow: /admin\nDisallow: /dashboard\n"
                             f"Sitemap: {base}/sitemap.xml\n")


async def sitemap(request: Request):
    base = config.settings.public_url
    marks = ",".join("?" * len(PUBLIC_STATUSES))
    rows = db.query(f"SELECT id, updated_at FROM projects WHERE is_hidden = 0 AND status IN ({marks})", PUBLIC_STATUSES)
    urls = [f"<url><loc>{base}/</loc></url>", f"<url><loc>{base}/explore</loc></url>",
            f"<url><loc>{base}/how-it-works</loc></url>"]
    urls += [f"<url><loc>{base}/projects/{r['id']}</loc><lastmod>{r['updated_at'][:10]}</lastmod></url>" for r in rows]
    xml = '<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' + "".join(urls) + "</urlset>"
    return Response(xml, media_type="application/xml")


async def manifest(request: Request):
    return FileResponse(Path(config.settings.frontend_dir) / "manifest.webmanifest", media_type="application/manifest+json",
                        headers={"Cache-Control": "public, max-age=3600"})


async def service_worker(request: Request):
    return FileResponse(Path(config.settings.frontend_dir) / "sw.js", media_type="text/javascript",
                        headers={"Cache-Control": "no-cache", "Service-Worker-Allowed": "/"})


async def assetlinks(request: Request):
    """Digital Asset Links: proves the Android app (Trusted Web Activity) and this site belong together."""
    s = config.settings
    if not (s.android_package and s.android_sha256):
        return JSONResponse([], headers={"Cache-Control": "no-cache"})
    return JSONResponse([{
        "relation": ["delegate_permission/common.handle_all_urls"],
        "target": {"namespace": "android_app", "package_name": s.android_package,
                   "sha256_cert_fingerprints": [f.strip() for f in s.android_sha256.split(",") if f.strip()]},
    }], headers={"Cache-Control": "no-cache"})


def create_app() -> Starlette:
    fe = Path(config.settings.frontend_dir)
    route_list = (auth.routes + account.routes + safety.routes + coordination.routes + orgs.routes + projects.routes + commitments.routes + files_ai.routes
                  + trust.routes + misc.routes)
    route_list += [
        Route("/robots.txt", robots),
        Route("/manifest.webmanifest", manifest),
        Route("/sw.js", service_worker),
        Route("/.well-known/assetlinks.json", assetlinks),
        Route("/sitemap.xml", sitemap),
        Mount("/static", app=StaticFiles(directory=fe), name="static"),
        Route("/{path:path}", spa, methods=["GET"]),
    ]
    return Starlette(
        routes=route_list,
        middleware=[Middleware(GZipMiddleware, minimum_size=800), Middleware(SecurityHeaders)],
        exception_handlers={ApiError: api_error, HTTPException: http_error, Exception: server_error},
        lifespan=lifespan,
    )


app = create_app()
