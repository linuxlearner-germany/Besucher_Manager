#!/usr/bin/env python3
"""
Fuehrt die wichtigsten operativen MVP-Checks nacheinander aus.

1. optionale Seed-Daten
2. Rollen-/Zugriffstest
3. End-to-End-MVP-Flow
4. kompakter CSV-Preview fuer unterschriftsrelevante Faelle
"""

from __future__ import annotations

import argparse
import os
import subprocess
import sys

from env_loader import env_default


def run_command(label: str, command: list[str], cwd: str) -> str:
    print(f"\n== {label} ==")
    completed = subprocess.run(command, cwd=cwd, check=True, text=True, capture_output=True)
    if completed.stdout.strip():
        print(completed.stdout.strip())
    if completed.stderr.strip():
        print(completed.stderr.strip(), file=sys.stderr)
    return completed.stdout


def main() -> int:
    parser = argparse.ArgumentParser(description="Fuehrt die wichtigsten operativen Besucher-MVP-Checks aus.")
    parser.add_argument("--cwd", default=os.getcwd(), help="Repository-Wurzel")
    parser.add_argument("--skip-seed", action="store_true", help="Seed-Lauf ueberspringen")
    parser.add_argument("--admin-user", default=env_default("ADMIN_USERNAME", "admin"))
    parser.add_argument("--admin-password", default=env_default("ADMIN_PASSWORD", "StrongPassw0rd!"))
    parser.add_argument("--guard-user", default="guard.demo")
    parser.add_argument("--guard-password", default="Test1234!")
    parser.add_argument("--sibe-user", default="sibe.demo")
    parser.add_argument("--sibe-password", default="Test1234!")
    args = parser.parse_args()

    if not args.skip_seed:
        run_command("Seed-Daten", ["npm", "run", "seed:sample"], args.cwd)

    run_command(
        "Rollencheck",
        [
            "python3",
            "scripts/ops/verify_role_access.py",
            "--base-url", "http://localhost:3030",
            "--admin-user", args.admin_user,
            "--admin-password", args.admin_password,
            "--guard-user", args.guard_user,
            "--guard-password", args.guard_password,
            "--sibe-user", args.sibe_user,
            "--sibe-password", args.sibe_password,
        ],
        args.cwd,
    )

    run_command(
        "MVP-Flow",
        [
            "python3",
            "scripts/ops/verify_mvp_flow.py",
            "--base-url", "http://localhost:3030",
            "--admin-user", args.admin_user,
            "--admin-password", args.admin_password,
            "--guard-user", args.guard_user,
            "--guard-password", args.guard_password,
            "--sibe-user", args.sibe_user,
            "--sibe-password", args.sibe_password,
        ],
        args.cwd,
    )

    report = run_command(
        "Unterschriftenreport (Preview)",
        [
            "python3",
            "scripts/ops/export_signature_followups.py",
            "--base-url", "http://localhost:3030",
            "--user", args.sibe_user,
            "--password", args.sibe_password,
        ],
        args.cwd,
    )

    preview = "\n".join(report.strip().splitlines()[:6])
    print("\n== Zusammenfassung ==")
    print("Operative Kernchecks erfolgreich.")
    if preview:
        print(preview)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
