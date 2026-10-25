"""SQLite persistence layer.

All SQL lives behind small helpers so the store can later be swapped for
Postgres/Mongo without touching route handlers' business rules.
"""
from __future__ import annotations

import json
import sqlite3
import threading
import uuid
from contextlib import contextmanager
from datetime import datetime, timezone
from typing import Any, Iterable

from . import config

SCHEMA = """
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    name TEXT NOT NULL,
    role TEXT NOT NULL,
    phone TEXT,
    city TEXT,
    region TEXT,
    bio TEXT,
    skills TEXT NOT NULL DEFAULT '[]',
    is_suspended INTEGER NOT NULL DEFAULT 0,
    is_demo INTEGER NOT NULL DEFAULT 0,
    email_notifications INTEGER NOT NULL DEFAULT 0,
    email_verified INTEGER NOT NULL DEFAULT 0,
    phone_verified INTEGER NOT NULL DEFAULT 0,
    language TEXT NOT NULL DEFAULT 'en',
    push_notifications INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS organizations (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    org_type TEXT NOT NULL,
    description TEXT,
    city TEXT,
    region TEXT,
    website TEXT,
    registration_number TEXT,
    contact_email TEXT,
    verification_status TEXT NOT NULL DEFAULT 'unverified',
    verified_by TEXT,
    verified_at TEXT,
    is_demo INTEGER NOT NULL DEFAULT 0,
    created_by TEXT NOT NULL REFERENCES users(id),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS org_members (
    org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    member_role TEXT NOT NULL DEFAULT 'member',
    created_at TEXT NOT NULL,
    PRIMARY KEY (org_id, user_id)
);

CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    owner_id TEXT NOT NULL REFERENCES users(id),
    org_id TEXT REFERENCES organizations(id),
    title TEXT NOT NULL,
    problem_statement TEXT NOT NULL DEFAULT '',
    proposed_solution TEXT NOT NULL DEFAULT '',
    story TEXT NOT NULL DEFAULT '',
    beneficiaries TEXT NOT NULL DEFAULT '',
    beneficiary_count INTEGER,
    city TEXT,
    region TEXT,
    location_detail TEXT,
    cause TEXT,
    budget_required REAL,
    volunteers_required INTEGER,
    materials TEXT NOT NULL DEFAULT '[]',
    skills TEXT NOT NULL DEFAULT '[]',
    time_commitment TEXT,
    duration_weeks INTEGER,
    start_date TEXT,
    end_date TEXT,
    original_description TEXT NOT NULL DEFAULT '',
    ai_assisted INTEGER NOT NULL DEFAULT 0,
    ai_provider TEXT,
    missing_info TEXT NOT NULL DEFAULT '[]',
    follow_up_questions TEXT NOT NULL DEFAULT '[]',
    status TEXT NOT NULL DEFAULT 'draft',
    review_notes TEXT,
    allow_multiple_supporters INTEGER NOT NULL DEFAULT 1,
    involves_children INTEGER NOT NULL DEFAULT 0,
    involves_vulnerable INTEGER NOT NULL DEFAULT 0,
    safeguarding_notes TEXT,
    need_verified INTEGER NOT NULL DEFAULT 0,
    financial_verified INTEGER NOT NULL DEFAULT 0,
    completion_verified INTEGER NOT NULL DEFAULT 0,
    is_hidden INTEGER NOT NULL DEFAULT 0,
    is_demo INTEGER NOT NULL DEFAULT 0,
    embedding TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    submitted_at TEXT,
    published_at TEXT,
    completed_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);
CREATE INDEX IF NOT EXISTS idx_projects_owner ON projects(owner_id);

CREATE TABLE IF NOT EXISTS milestones (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    due_date TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    responsible TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    completed_at TEXT,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS outcomes (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    metric TEXT NOT NULL,
    target REAL,
    unit TEXT,
    reported_value REAL,
    verified_value REAL,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS checklist_items (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    text TEXT NOT NULL,
    done INTEGER NOT NULL DEFAULT 0,
    done_by TEXT,
    done_at TEXT,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS commitments (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    supporter_id TEXT NOT NULL REFERENCES users(id),
    org_id TEXT REFERENCES organizations(id),
    kind TEXT NOT NULL,
    quantity REAL NOT NULL DEFAULT 0,
    item TEXT,
    unit TEXT,
    hours REAL,
    description TEXT,
    deadline TEXT,
    status TEXT NOT NULL DEFAULT 'proposed',
    owner_message TEXT,
    received_quantity REAL NOT NULL DEFAULT 0,
    spent_amount REAL NOT NULL DEFAULT 0,
    responsibility TEXT,
    is_anonymous INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_commitments_project ON commitments(project_id);

CREATE TABLE IF NOT EXISTS updates (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    author_id TEXT NOT NULL REFERENCES users(id),
    kind TEXT NOT NULL DEFAULT 'progress',
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    file_ids TEXT NOT NULL DEFAULT '[]',
    is_hidden INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS files (
    id TEXT PRIMARY KEY,
    owner_id TEXT NOT NULL REFERENCES users(id),
    project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
    org_id TEXT REFERENCES organizations(id) ON DELETE SET NULL,
    original_name TEXT NOT NULL,
    stored_name TEXT NOT NULL,
    mime TEXT NOT NULL,
    size INTEGER NOT NULL,
    purpose TEXT NOT NULL,
    visibility TEXT NOT NULL DEFAULT 'private',
    consent_confirmed INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS impact_reports (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL UNIQUE REFERENCES projects(id) ON DELETE CASCADE,
    people_reached INTEGER,
    volunteers_involved INTEGER,
    volunteer_hours REAL,
    materials_delivered TEXT,
    funds_spent REAL,
    summary TEXT NOT NULL,
    challenges TEXT,
    file_ids TEXT NOT NULL DEFAULT '[]',
    submitted_by TEXT NOT NULL REFERENCES users(id),
    submitted_at TEXT NOT NULL,
    verified INTEGER NOT NULL DEFAULT 0,
    verified_people_reached INTEGER,
    verified_volunteers_involved INTEGER,
    verified_volunteer_hours REAL,
    verified_funds_spent REAL,
    verification_notes TEXT,
    verified_by TEXT,
    verified_at TEXT
);

CREATE TABLE IF NOT EXISTS verifications (
    id TEXT PRIMARY KEY,
    subject_type TEXT NOT NULL,
    subject_id TEXT NOT NULL,
    kind TEXT NOT NULL,
    requested_by TEXT NOT NULL REFERENCES users(id),
    notes TEXT,
    file_ids TEXT NOT NULL DEFAULT '[]',
    status TEXT NOT NULL DEFAULT 'pending',
    reviewer_id TEXT REFERENCES users(id),
    reviewer_notes TEXT,
    created_at TEXT NOT NULL,
    reviewed_at TEXT
);

CREATE TABLE IF NOT EXISTS reports (
    id TEXT PRIMARY KEY,
    reporter_id TEXT NOT NULL REFERENCES users(id),
    subject_type TEXT NOT NULL,
    subject_id TEXT NOT NULL,
    reason TEXT NOT NULL,
    details TEXT,
    status TEXT NOT NULL DEFAULT 'open',
    resolution TEXT,
    handled_by TEXT REFERENCES users(id),
    created_at TEXT NOT NULL,
    handled_at TEXT
);

CREATE TABLE IF NOT EXISTS notifications (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    body TEXT,
    link TEXT,
    dedupe_key TEXT UNIQUE,
    is_read INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, is_read);

CREATE TABLE IF NOT EXISTS audit_log (
    id TEXT PRIMARY KEY,
    actor_id TEXT,
    action TEXT NOT NULL,
    subject_type TEXT NOT NULL,
    subject_id TEXT NOT NULL,
    details TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_audit_subject ON audit_log(subject_type, subject_id);

-- one-time tokens: password reset and email verification links, phone codes, phone sign-up tickets
CREATE TABLE IF NOT EXISTS auth_tokens (
    id TEXT PRIMARY KEY,
    kind TEXT NOT NULL,
    user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
    target TEXT,
    secret_hash TEXT NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    expires_at TEXT NOT NULL,
    used_at TEXT,
    created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_auth_tokens_lookup ON auth_tokens(kind, secret_hash);
CREATE INDEX IF NOT EXISTS idx_auth_tokens_target ON auth_tokens(kind, target, created_at);

CREATE TABLE IF NOT EXISTS user_blocks (
    blocker_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    blocked_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL,
    PRIMARY KEY (blocker_id, blocked_id)
);

CREATE TABLE IF NOT EXISTS push_subscriptions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    endpoint TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS project_interests (
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL,
    PRIMARY KEY (project_id, user_id)
);

CREATE TABLE IF NOT EXISTS project_messages (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    author_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    body TEXT NOT NULL,
    is_hidden INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_messages_project ON project_messages(project_id, created_at);

CREATE TABLE IF NOT EXISTS client_errors (
    id TEXT PRIMARY KEY,
    message TEXT NOT NULL,
    source TEXT,
    path TEXT,
    app_version TEXT,
    created_at TEXT NOT NULL
);
"""

JSON_COLUMNS = {
    "skills", "materials", "missing_info", "follow_up_questions", "file_ids", "details", "embedding",
}

_local = threading.local()
_init_lock = threading.Lock()
_initialized_paths: set[str] = set()


def now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def new_id() -> str:
    return uuid.uuid4().hex


def _add_missing_columns(conn: sqlite3.Connection) -> None:
    """Upgrade a database made by an older version: add columns the current schema has but the file lacks."""
    ref = sqlite3.connect(":memory:")
    ref.executescript(SCHEMA)
    existing = {r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type = 'table'")}
    for (table,) in ref.execute("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'"):
        if table not in existing:
            continue
        have = {r[1] for r in conn.execute(f"PRAGMA table_info({table})")}
        for _cid, name, ctype, notnull, default, pk in ref.execute(f"PRAGMA table_info({table})"):
            if name in have or pk:
                continue
            ddl = f"ALTER TABLE {table} ADD COLUMN {name} {ctype}"
            if default is not None:
                ddl += f" {'NOT NULL ' if notnull else ''}DEFAULT {default}"
            conn.execute(ddl)
    ref.close()
    conn.commit()


def _connect() -> sqlite3.Connection:
    path = str(config.settings.database_path)
    conn = getattr(_local, "conn", None)
    if conn is not None and getattr(_local, "path", None) == path:
        return conn
    conn = sqlite3.connect(path, check_same_thread=False, timeout=15)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA journal_mode = WAL")
    _local.conn = conn
    _local.path = path
    with _init_lock:
        if path not in _initialized_paths:
            _add_missing_columns(conn)
            conn.executescript(SCHEMA)
            conn.commit()
            _initialized_paths.add(path)
    return conn


def init_db() -> None:
    _connect()


def reset_connection() -> None:
    conn = getattr(_local, "conn", None)
    if conn is not None:
        conn.close()
    _local.conn = None
    _local.path = None


def _decode(row: sqlite3.Row | None) -> dict | None:
    if row is None:
        return None
    out = dict(row)
    for key, value in out.items():
        if key in JSON_COLUMNS and isinstance(value, str):
            try:
                out[key] = json.loads(value)
            except ValueError:
                pass
    return out


def _encode(value: Any) -> Any:
    if isinstance(value, (list, dict)):
        return json.dumps(value)
    if isinstance(value, bool):
        return int(value)
    return value


def query(sql: str, params: Iterable[Any] = ()) -> list[dict]:
    cur = _connect().execute(sql, tuple(params))
    return [_decode(r) for r in cur.fetchall()]


def one(sql: str, params: Iterable[Any] = ()) -> dict | None:
    cur = _connect().execute(sql, tuple(params))
    return _decode(cur.fetchone())


def scalar(sql: str, params: Iterable[Any] = ()) -> Any:
    row = _connect().execute(sql, tuple(params)).fetchone()
    return row[0] if row else None


def execute(sql: str, params: Iterable[Any] = ()) -> int:
    conn = _connect()
    cur = conn.execute(sql, tuple(_encode(p) for p in params))
    if not getattr(_local, "in_tx", False):
        conn.commit()
    return cur.rowcount


def insert(table: str, data: dict) -> dict:
    cols = list(data.keys())
    sql = f"INSERT INTO {table} ({', '.join(cols)}) VALUES ({', '.join('?' for _ in cols)})"
    execute(sql, [data[c] for c in cols])
    return data


def update(table: str, row_id: str, data: dict, id_col: str = "id") -> None:
    if not data:
        return
    cols = list(data.keys())
    sql = f"UPDATE {table} SET {', '.join(f'{c} = ?' for c in cols)} WHERE {id_col} = ?"
    execute(sql, [data[c] for c in cols] + [row_id])


def get(table: str, row_id: str) -> dict | None:
    return one(f"SELECT * FROM {table} WHERE id = ?", (row_id,))


@contextmanager
def transaction():
    """Group several writes atomically (BEGIN IMMEDIATE serialises writers)."""
    conn = _connect()
    if getattr(_local, "in_tx", False):
        yield conn
        return
    conn.execute("BEGIN IMMEDIATE")
    _local.in_tx = True
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        _local.in_tx = False
