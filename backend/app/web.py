"""Small request/response helpers shared by route modules."""
from __future__ import annotations

import json
from typing import Any, TypeVar

from pydantic import BaseModel, ValidationError
from starlette.requests import Request
from starlette.responses import JSONResponse

from .errors import ApiError

M = TypeVar("M", bound=BaseModel)


def ok(data: Any = None, status: int = 200) -> JSONResponse:
    return JSONResponse(data if data is not None else {"ok": True}, status_code=status)


async def parse(request: Request, model: type[M]) -> M:
    ctype = request.headers.get("content-type", "")
    if "application/json" not in ctype:
        # Also acts as CSRF protection: cross-site HTML forms cannot send JSON.
        raise ApiError(415, "Requests must be sent as JSON.")
    try:
        raw = await request.body()
        data = json.loads(raw or b"{}")
    except ValueError:
        raise ApiError(400, "Request body is not valid JSON.")
    try:
        return model.model_validate(data)
    except ValidationError as exc:
        details = []
        for err in exc.errors():
            loc = ".".join(str(p) for p in err.get("loc", ()) if p != "body")
            msg = err.get("msg", "Invalid value").replace("Value error, ", "")
            details.append({"field": loc, "message": msg})
        first = details[0] if details else {"field": None, "message": "Invalid input"}
        label = first["field"].replace("_", " ") if first["field"] else "Input"
        raise ApiError(422, f"{label}: {first['message']}", field=first["field"], details=details)


def qint(request: Request, name: str, default: int | None = None, lo: int | None = None, hi: int | None = None) -> int | None:
    raw = request.query_params.get(name)
    if raw in (None, ""):
        return default
    try:
        val = int(float(raw))
    except ValueError:
        raise ApiError(422, f"{name} must be a number.", field=name)
    if lo is not None:
        val = max(lo, val)
    if hi is not None:
        val = min(hi, val)
    return val


def qfloat(request: Request, name: str) -> float | None:
    raw = request.query_params.get(name)
    if raw in (None, ""):
        return None
    try:
        return float(raw)
    except ValueError:
        raise ApiError(422, f"{name} must be a number.", field=name)
