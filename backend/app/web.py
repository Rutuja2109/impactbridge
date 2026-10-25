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
            details.append({"field": loc, "message": _friendly(err)})
        first = details[0] if details else {"field": None, "message": "Please check what you entered."}
        if len(details) > 1:
            top = "Please fix the highlighted fields."
        elif first["field"]:
            top = f"{_label(first['field'])}: {first['message']}"
        else:
            top = first["message"]
        raise ApiError(422, top, field=first["field"], details=details)


_LABELS = {"organization.name": "Organization name", "organization.org_type": "Organization type",
           "accept_terms": "Terms", "city": "City or town", "region": "State / region", "name": "Name"}


def _label(field: str) -> str:
    return _LABELS.get(field) or field.split(".")[-1].replace("_", " ").capitalize()


def _friendly(err: dict) -> str:
    """Turn a validation error into a sentence a person can act on (no library jargon)."""
    kind, ctx = err.get("type", ""), err.get("ctx") or {}
    if kind in ("missing", "string_type", "none_required", "model_attributes_type"):
        return "Please fill this in."
    if kind == "string_too_short":
        n = ctx.get("min_length", 1)
        return "Please fill this in." if n <= 1 else f"Use at least {n} characters."
    if kind == "string_too_long":
        return f"Keep this under {ctx.get('max_length', 0) + 1} characters."
    if kind in ("int_parsing", "float_parsing", "int_type", "float_type", "decimal_parsing"):
        return "Enter a number."
    if kind in ("greater_than_equal", "greater_than"):
        return f"Enter a number that is {'at least' if kind.endswith('equal') else 'more than'} {ctx.get('ge', ctx.get('gt', 0))}."
    if kind in ("less_than_equal", "less_than"):
        return f"Enter a number that is {'at most' if kind.endswith('equal') else 'less than'} {ctx.get('le', ctx.get('lt', 0))}."
    if kind in ("bool_type", "bool_parsing"):
        return "Please tick or untick this."
    if kind == "literal_error" or kind == "enum":
        return "Please choose one of the options."
    if kind.startswith("value_error"):
        return str(err.get("msg", "Please check this.")).replace("Value error, ", "")
    return "Please check this."


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
