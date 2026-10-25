"""Web Push without payloads: the push only wakes the app, which then fetches the latest notification itself.
That keeps message content off the push services and avoids payload encryption."""
from __future__ import annotations

import base64
import logging
import threading
import time
import urllib.error
import urllib.parse
import urllib.request

import jwt

from .. import config, db

log = logging.getLogger("impactbridge")

ALLOWED_PUSH_HOSTS = ("fcm.googleapis.com", "updates.push.services.mozilla.com", "web.push.apple.com",
                      "notify.windows.com", "push.services.mozilla.com")


def _b64u(b: bytes) -> str:
    return base64.urlsafe_b64encode(b).rstrip(b"=").decode()


def _b64d(s: str) -> bytes:
    return base64.urlsafe_b64decode(s + "=" * (-len(s) % 4))


def generate_keys() -> tuple[str, str]:
    from cryptography.hazmat.primitives.asymmetric import ec
    from cryptography.hazmat.primitives import serialization
    key = ec.generate_private_key(ec.SECP256R1())
    priv = key.private_numbers().private_value.to_bytes(32, "big")
    pub = key.public_key().public_bytes(serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint)
    return _b64u(pub), _b64u(priv)


def _private_key():
    from cryptography.hazmat.primitives.asymmetric import ec
    d = int.from_bytes(_b64d(config.settings.vapid_private), "big")
    return ec.derive_private_key(d, ec.SECP256R1())


def endpoint_allowed(endpoint: str) -> bool:
    try:
        u = urllib.parse.urlparse(endpoint)
    except ValueError:
        return False
    host = (u.hostname or "").lower()
    return u.scheme == "https" and any(host == h or host.endswith("." + h) for h in ALLOWED_PUSH_HOSTS)


def _send_one(sub_id: str, endpoint: str) -> None:
    s = config.settings
    u = urllib.parse.urlparse(endpoint)
    claims = {"aud": f"{u.scheme}://{u.netloc}", "exp": int(time.time()) + 12 * 3600,
              "sub": s.vapid_subject or (f"mailto:{s.support_email}" if s.support_email else s.public_url)}
    token = jwt.encode(claims, _private_key(), algorithm="ES256")
    req = urllib.request.Request(endpoint, data=b"", method="POST", headers={
        "Authorization": f"vapid t={token}, k={s.vapid_public}", "TTL": "86400", "Urgency": "normal", "Content-Length": "0"})
    try:
        urllib.request.urlopen(req, timeout=15).read()
    except urllib.error.HTTPError as exc:
        if exc.code in (404, 410):  # subscription expired or unsubscribed
            db.execute("DELETE FROM push_subscriptions WHERE id = ?", (sub_id,))
        else:
            log.warning("Push failed (%s): %s", exc.code, endpoint[:60])
    except Exception as exc:
        log.warning("Push failed: %s", exc)


def push_to_user(user_id: str) -> int:
    if not config.settings.push_configured:
        return 0
    user = db.get("users", user_id)
    if not user or not user["push_notifications"] or user["is_suspended"]:
        return 0
    subs = db.query("SELECT id, endpoint FROM push_subscriptions WHERE user_id = ?", (user_id,))
    for sub in subs:
        threading.Thread(target=_send_one, args=(sub["id"], sub["endpoint"]), daemon=True).start()
    return len(subs)
