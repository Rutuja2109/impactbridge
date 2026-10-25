"""Audit log, in-app notifications and optional email delivery."""
from __future__ import annotations

import json
import logging
import threading
import urllib.request
from datetime import date, datetime, timedelta, timezone

from .. import config, db

log = logging.getLogger("impactbridge")


def audit(actor_id: str | None, action: str, subject_type: str, subject_id: str, **details) -> None:
    db.insert("audit_log", {
        "id": db.new_id(),
        "actor_id": actor_id,
        "action": action,
        "subject_type": subject_type,
        "subject_id": subject_id,
        "details": json.dumps(details, default=str),
        "created_at": db.now(),
    })


def notify(user_id: str, type_: str, title: str, body: str = "", link: str = "",
           dedupe_key: str | None = None, email: bool = True) -> bool:
    """Create an in-app notification. Returns False if a deduplicated one already exists."""
    if dedupe_key and db.one("SELECT id FROM notifications WHERE dedupe_key = ?", (dedupe_key,)):
        return False
    db.insert("notifications", {
        "id": db.new_id(), "user_id": user_id, "type": type_, "title": title, "body": body,
        "link": link, "dedupe_key": dedupe_key, "is_read": 0, "created_at": db.now(),
    })
    try:
        from .push import push_to_user
        push_to_user(user_id)
    except Exception as exc:  # push must never break the request
        log.warning("Push scheduling failed: %s", exc)
    if email and config.settings.resend_api_key:
        user = db.get("users", user_id)
        if user and user["email_notifications"] and not user["is_demo"]:
            threading.Thread(target=_send_email, args=(user["email"], title, body, link), daemon=True).start()
    return True


def notify_many(user_ids, *args, **kwargs) -> None:
    for uid in dict.fromkeys(u for u in user_ids if u):
        notify(uid, *args, **kwargs)


def reviewers() -> list[str]:
    return [r["id"] for r in db.query("SELECT id FROM users WHERE role IN ('admin','verifier') AND is_suspended = 0")]


def send_email(to: str, subject: str, html: str) -> bool:
    """Send one email through Resend in the background. Returns False when email isn't configured."""
    s = config.settings
    if not s.resend_api_key or not to or to.endswith(".invalid"):
        return False

    def _go():
        payload = json.dumps({"from": s.email_from, "to": [to], "subject": f"ImpactBridge: {subject}", "html": html}).encode()
        req = urllib.request.Request("https://api.resend.com/emails", data=payload, method="POST", headers={
            "Authorization": f"Bearer {s.resend_api_key}", "Content-Type": "application/json"})
        try:
            urllib.request.urlopen(req, timeout=15).read()
        except Exception as exc:  # email must never break the request
            log.warning("Email delivery failed: %s", exc)
    threading.Thread(target=_go, daemon=True).start()
    return True


def _send_email(to: str, subject: str, body: str, link: str) -> None:
    s = config.settings
    url = f"{s.public_url}{link}" if link.startswith("/") else link
    html = (f"<p>{_esc(body)}</p>" + (f'<p><a href="{_esc(url)}">Open in ImpactBridge</a></p>' if link else "")
            + "<p style='color:#666;font-size:12px'>You can turn off email notifications in your profile.</p>")
    payload = json.dumps({"from": s.email_from, "to": [to], "subject": f"ImpactBridge: {subject}", "html": html}).encode()
    req = urllib.request.Request("https://api.resend.com/emails", data=payload, method="POST", headers={
        "Authorization": f"Bearer {s.resend_api_key}", "Content-Type": "application/json"})
    try:
        urllib.request.urlopen(req, timeout=15).read()
    except Exception as exc:  # email must never break the request
        log.warning("Email delivery failed: %s", exc)


def _esc(text: str) -> str:
    return (text or "").replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace('"', "&quot;")


def sweep_deadlines(today: date | None = None, days_ahead: int = 3) -> int:
    """Notify project teams about milestones and commitment deadlines due soon. Idempotent."""
    today = today or datetime.now(timezone.utc).date()
    horizon = (today + timedelta(days=days_ahead)).isoformat()
    created = 0
    rows = db.query(
        """SELECT m.id, m.title, m.due_date, p.id AS pid, p.title AS ptitle, p.owner_id
           FROM milestones m JOIN projects p ON p.id = m.project_id
           WHERE m.status != 'done' AND m.due_date IS NOT NULL AND m.due_date <= ? AND m.due_date >= ?
             AND p.status IN ('published','in_progress')""",
        (horizon, today.isoformat()))
    for r in rows:
        recipients = {r["owner_id"]} | {c["supporter_id"] for c in db.query(
            "SELECT supporter_id FROM commitments WHERE project_id = ? AND status = 'accepted'", (r["pid"],))}
        for uid in recipients:
            if notify(uid, "deadline", f"Milestone due {r['due_date']}: {r['title']}",
                      f"Project: {r['ptitle']}", f"/projects/{r['pid']}",
                      dedupe_key=f"ms-due:{r['id']}:{uid}:{r['due_date']}"):
                created += 1
    rows = db.query(
        """SELECT c.id, c.deadline, c.kind, c.supporter_id, p.id AS pid, p.title AS ptitle, p.owner_id
           FROM commitments c JOIN projects p ON p.id = c.project_id
           WHERE c.status = 'accepted' AND c.deadline IS NOT NULL AND c.deadline <= ? AND c.deadline >= ?""",
        (horizon, today.isoformat()))
    for r in rows:
        for uid in {r["supporter_id"], r["owner_id"]}:
            if notify(uid, "deadline", f"Commitment due {r['deadline']}",
                      f"{r['kind'].title()} commitment for {r['ptitle']}", f"/projects/{r['pid']}",
                      dedupe_key=f"cm-due:{r['id']}:{uid}:{r['deadline']}"):
                created += 1
    return created
