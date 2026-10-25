from __future__ import annotations


class ApiError(Exception):
    def __init__(self, status: int, message: str, field: str | None = None, details: list | None = None, code: str | None = None):
        super().__init__(message)
        self.status = status
        self.message = message
        self.field = field
        self.details = details or []
        self.code = code

    def to_dict(self) -> dict:
        out: dict = {"error": self.message}
        if self.field:
            out["field"] = self.field
        if self.code:
            out["code"] = self.code
        if self.details:
            out["details"] = self.details
        return out
