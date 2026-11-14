"""One-time setup: ask for the team database login and save it to MOTHER/.env (never committed to git).

    python -m mother.configure          (start.bat / start.sh run this automatically the first time)
"""
from __future__ import annotations

import getpass
import sys

from .config import MOTHER_DIR

ENV = MOTHER_DIR / ".env"
DEFAULTS = {"DB_HOST": "100.118.238.112", "DB_PORT": "3306", "DB_NAME": "astro_api", "DB_USER": ""}


def ask(label: str, default: str) -> str:
    while True:
        v = input(f"  {label} [{default}]: " if default else f"  {label}: ").strip() or default
        if v:
            return v
        print("  This is required (ask the database owner).")


def main() -> int:
    print("\n  MOTHER setup - connection to the team database (via Tailscale)")
    print("  Press Enter to accept the value in [brackets].\n")
    while True:
        host = ask("Database address", DEFAULTS["DB_HOST"])
        port = ask("Port", DEFAULTS["DB_PORT"])
        user = ask("User", DEFAULTS["DB_USER"])
        password = getpass.getpass("  Password (typing is hidden): ")
        ENV.write_text(
            "# MOTHER database connection - local only, git-ignored. Re-create with: start --setup\n"
            f"DB_HOST={host}\nDB_PORT={port}\nDB_NAME={DEFAULTS['DB_NAME']}\nDB_USER={user}\nDB_PASSWORD={password}\n",
            encoding="utf-8")
        print("\n  Testing the connection...")
        try:
            import os
            for k in ("DB_HOST", "DB_PORT", "DB_NAME", "DB_USER", "DB_PASSWORD"):
                os.environ.pop(k, None)
            from .db import connect
            connect().close()
            print("  Connected. Saved to MOTHER/.env\n")
            return 0
        except Exception as e:
            print(f"\n  Could not connect: {type(e).__name__}: {e}")
            print("  - Is Tailscale running and logged in to the team network?")
            print("  - Is the password right? (ask the database owner)")
            if input("  Try again? [Y/n]: ").strip().lower() == "n":
                print("  Saved anyway. Run start again with --setup to change it.\n")
                return 1


if __name__ == "__main__":
    sys.exit(main())
