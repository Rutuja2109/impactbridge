"""Command-line utilities.

    python -m app.cli create-admin you@example.org "Your Name"     # prompts for a password
    python -m app.cli set-role someone@example.org verifier
    python -m app.cli seed-demo                                     # clearly-labelled demo data
    python -m app.cli remove-demo
    python -m app.cli vapid-keys                                    # keys for push notifications
"""
from __future__ import annotations

import getpass
import sys

from . import db
from .security import ALL_ROLES, hash_password, validate_password_strength


def create_admin(email: str, name: str) -> None:
    email = email.strip().lower()
    if db.one("SELECT id FROM users WHERE email = ?", (email,)):
        print("A user with that email already exists. Use set-role instead.")
        sys.exit(1)
    pw = getpass.getpass("Password for the new administrator: ")
    validate_password_strength(pw)
    ts = db.now()
    db.insert("users", {"id": db.new_id(), "email": email, "password_hash": hash_password(pw), "name": name,
                        "role": "admin", "skills": "[]", "created_at": ts, "updated_at": ts})
    print(f"Administrator {email} created.")


def set_role(email: str, role: str) -> None:
    if role not in ALL_ROLES:
        print(f"Role must be one of: {', '.join(sorted(ALL_ROLES))}")
        sys.exit(1)
    n = db.execute("UPDATE users SET role = ? WHERE email = ?", (role, email.strip().lower()))
    print("Updated." if n else "No user with that email.")


def main(argv: list[str]) -> None:
    db.init_db()
    if not argv:
        print(__doc__)
        return
    cmd, *args = argv
    if cmd == "create-admin" and len(args) >= 1:
        create_admin(args[0], args[1] if len(args) > 1 else "Administrator")
    elif cmd == "set-role" and len(args) == 2:
        set_role(*args)
    elif cmd == "seed-demo":
        from .seed import seed_demo
        seed_demo()
    elif cmd == "vapid-keys":
        from .services.push import generate_keys
        pub, priv = generate_keys()
        print(f"VAPID_PUBLIC_KEY={pub}\nVAPID_PRIVATE_KEY={priv}")
    elif cmd == "remove-demo":
        from .seed import remove_demo
        remove_demo()
    else:
        print(__doc__)


if __name__ == "__main__":
    main(sys.argv[1:])
