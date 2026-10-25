"""Runtime configuration, read from environment variables (optionally a .env file)."""
from __future__ import annotations

import os
import secrets
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent  # backend/
ROOT_DIR = BASE_DIR.parent  # project root


def _load_dotenv() -> None:
    env_file = BASE_DIR / ".env"
    if not env_file.exists():
        return
    for raw in env_file.read_text().splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


_load_dotenv()


def _bool(name: str, default: bool = False) -> bool:
    return os.environ.get(name, str(default)).lower() in {"1", "true", "yes", "on"}


class Settings:
    def __init__(self) -> None:
        self.env = os.environ.get("APP_ENV", "development")
        self.data_dir = Path(os.environ.get("DATA_DIR", BASE_DIR / "data"))
        self.database_path = Path(os.environ.get("DATABASE_PATH", self.data_dir / "impactbridge.db"))
        self.upload_dir = Path(os.environ.get("UPLOAD_DIR", self.data_dir / "uploads"))
        self.frontend_dir = Path(os.environ.get("FRONTEND_DIR", ROOT_DIR / "frontend"))
        secret = os.environ.get("JWT_SECRET", "")
        if not secret:
            if self.env == "production":
                raise RuntimeError("JWT_SECRET must be set in production")
            secret_file = self.data_dir / ".jwt_secret"
            self.data_dir.mkdir(parents=True, exist_ok=True)
            if secret_file.exists():
                secret = secret_file.read_text().strip()
            else:
                secret = secrets.token_urlsafe(48)
                secret_file.write_text(secret)
                secret_file.chmod(0o600)
        self.jwt_secret = secret
        self.jwt_ttl_hours = int(os.environ.get("JWT_TTL_HOURS", "72"))
        self.cookie_secure = _bool("COOKIE_SECURE", self.env == "production")
        self.public_url = os.environ.get("PUBLIC_URL", "http://localhost:8000").rstrip("/")
        self.currency = os.environ.get("CURRENCY", "INR")
        self.max_upload_mb = int(os.environ.get("MAX_UPLOAD_MB", "10"))

        # AI (all optional; features report "not configured" when missing)
        self.ai_provider = os.environ.get("AI_PROVIDER", "").lower()  # anthropic | gemini | openai | "" (auto)
        self.anthropic_api_key = os.environ.get("ANTHROPIC_API_KEY", "")
        self.anthropic_model = os.environ.get("ANTHROPIC_MODEL", "claude-sonnet-5-5")
        self.gemini_api_key = os.environ.get("GEMINI_API_KEY", "")
        self.gemini_model = os.environ.get("GEMINI_MODEL", "gemini-3.1-pro")
        self.gemini_embed_model = os.environ.get("GEMINI_EMBED_MODEL", "text-embedding-004")
        self.openai_api_key = os.environ.get("OPENAI_API_KEY", "")
        self.openai_model = os.environ.get("OPENAI_MODEL", "gpt-5")
        self.openai_embed_model = os.environ.get("OPENAI_EMBED_MODEL", "text-embedding-3-small")
        self.whisper_model = os.environ.get("WHISPER_MODEL", "whisper-1")

        # Email (optional)
        self.resend_api_key = os.environ.get("RESEND_API_KEY", "")
        self.email_from = os.environ.get("EMAIL_FROM", "ImpactBridge <notifications@example.org>")

        # SMS for phone sign-in codes (optional): "msg91" or "twilio"
        self.sms_provider = os.environ.get("SMS_PROVIDER", "").lower()
        self.msg91_auth_key = os.environ.get("MSG91_AUTH_KEY", "")
        self.msg91_template_id = os.environ.get("MSG91_TEMPLATE_ID", "")
        self.twilio_sid = os.environ.get("TWILIO_ACCOUNT_SID", "")
        self.twilio_token = os.environ.get("TWILIO_AUTH_TOKEN", "")
        self.twilio_from = os.environ.get("TWILIO_FROM", "")

        # Web push (optional): generate with `python -m app.cli vapid-keys`
        self.vapid_public = os.environ.get("VAPID_PUBLIC_KEY", "")
        self.vapid_private = os.environ.get("VAPID_PRIVATE_KEY", "")
        self.vapid_subject = os.environ.get("VAPID_SUBJECT", "")

        # Android app (Trusted Web Activity) verification and support contact
        self.android_package = os.environ.get("ANDROID_PACKAGE_NAME", "")
        self.android_sha256 = os.environ.get("ANDROID_CERT_SHA256", "")
        self.support_email = os.environ.get("SUPPORT_EMAIL", "")
        self.support_whatsapp = os.environ.get("SUPPORT_WHATSAPP", "")

        # Content rules: sample projects are hidden from the public in production, and a need must
        # have at least one real photo before it can be sent for review.
        self.show_demo_publicly = _bool("SHOW_DEMO_PROJECTS", self.env != "production")
        self.require_project_photo = _bool("REQUIRE_PROJECT_PHOTO", True)

        # Bootstrap administrator (optional; created on startup if both set)
        self.admin_email = os.environ.get("ADMIN_EMAIL", "")
        self.admin_password = os.environ.get("ADMIN_PASSWORD", "")

        self.data_dir.mkdir(parents=True, exist_ok=True)
        self.upload_dir.mkdir(parents=True, exist_ok=True)

    # --- derived -------------------------------------------------------
    @property
    def sms_configured(self) -> bool:
        if self.sms_provider == "msg91":
            return bool(self.msg91_auth_key and self.msg91_template_id)
        if self.sms_provider == "twilio":
            return bool(self.twilio_sid and self.twilio_token and self.twilio_from)
        return False

    @property
    def push_configured(self) -> bool:
        return bool(self.vapid_public and self.vapid_private)

    @property
    def active_ai_provider(self) -> str | None:
        keys = {
            "anthropic": self.anthropic_api_key,
            "gemini": self.gemini_api_key,
            "openai": self.openai_api_key,
        }
        if self.ai_provider in keys:
            return self.ai_provider if keys[self.ai_provider] else None
        for name in ("anthropic", "gemini", "openai"):
            if keys[name]:
                return name
        return None

    @property
    def embeddings_provider(self) -> str | None:
        if self.openai_api_key:
            return "openai"
        if self.gemini_api_key:
            return "gemini"
        return None

    def integrations(self) -> dict:
        return {
            "ai_structuring": {
                "configured": self.active_ai_provider is not None,
                "provider": self.active_ai_provider,
                "needs": "ANTHROPIC_API_KEY, GEMINI_API_KEY or OPENAI_API_KEY",
            },
            "semantic_search": {
                "configured": self.embeddings_provider is not None,
                "provider": self.embeddings_provider,
                "needs": "OPENAI_API_KEY or GEMINI_API_KEY (embeddings)",
            },
            "voice_transcription": {
                "configured": bool(self.openai_api_key),
                "provider": "openai-whisper" if self.openai_api_key else None,
                "needs": "OPENAI_API_KEY (Whisper). Browser dictation works without it in supported browsers.",
            },
            "email": {
                "configured": bool(self.resend_api_key),
                "provider": "resend" if self.resend_api_key else None,
                "needs": "RESEND_API_KEY and EMAIL_FROM",
            },
            "sms": {
                "configured": self.sms_configured,
                "provider": self.sms_provider if self.sms_configured else None,
                "needs": "SMS_PROVIDER=msg91 with MSG91_AUTH_KEY and MSG91_TEMPLATE_ID, or SMS_PROVIDER=twilio with TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and TWILIO_FROM",
            },
            "push": {
                "configured": self.push_configured,
                "provider": "web-push" if self.push_configured else None,
                "needs": "VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY (python -m app.cli vapid-keys)",
            },
            "payments": {
                "configured": False,
                "provider": None,
                "needs": "Not implemented: money pledges are recorded, not collected online.",
            },
        }


settings = Settings()


def reload_settings() -> Settings:
    global settings
    settings = Settings()
    return settings
