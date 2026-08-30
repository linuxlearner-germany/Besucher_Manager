#!/usr/bin/env python3
"""Apply one validated Besucher Manager NTP source to Chrony."""

from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import re
import stat
import subprocess
import sys
import tempfile
from pathlib import Path

HOST_LABEL = re.compile(r"^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$")


def valid_host(value: str) -> bool:
    if not value or len(value) > 253 or value.endswith("."):
        return False
    labels = value.split(".")
    return len(labels) >= 2 and all(HOST_LABEL.fullmatch(label) for label in labels)


def read_request(request_path: Path) -> tuple[bool, str]:
    flags = os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0)
    descriptor = os.open(request_path, flags)
    try:
        details = os.fstat(descriptor)
        if not stat.S_ISREG(details.st_mode) or details.st_size > 4096:
            raise ValueError("invalid request file")
        with os.fdopen(descriptor, "r", encoding="utf-8", closefd=False) as handle:
            payload = json.load(handle)
    finally:
        os.close(descriptor)

    enabled = payload.get("enabled")
    server = payload.get("server")
    if not isinstance(enabled, bool) or not isinstance(server, str):
        raise ValueError("invalid request payload")
    if server and not valid_host(server):
        raise ValueError("invalid NTP server")
    if enabled and not server:
        raise ValueError("enabled NTP source requires a server")
    return enabled, server


def atomic_write(target: Path, content: str, mode: int) -> None:
    target.parent.mkdir(parents=True, exist_ok=True)
    descriptor, temporary_name = tempfile.mkstemp(prefix=f".{target.name}.", dir=target.parent)
    temporary = Path(temporary_name)
    try:
        os.fchmod(descriptor, mode)
        with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
            handle.write(content)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, target)
    except BaseException:
        temporary.unlink(missing_ok=True)
        raise


def write_status(status_path: Path, state: str, enabled: bool, server: str, message: str) -> None:
    payload = {
        "state": state,
        "enabled": enabled,
        "server": server,
        "message": message,
        "appliedAt": dt.datetime.now(dt.timezone.utc).isoformat().replace("+00:00", "Z"),
    }
    atomic_write(status_path, json.dumps(payload, ensure_ascii=False) + "\n", 0o644)


def reload_sources(chronyc: Path) -> str:
    result = subprocess.run(
        [str(chronyc), "reload", "sources"],
        check=True,
        capture_output=True,
        text=True,
        timeout=15,
    )
    return (result.stdout or "Chrony-Quellen neu geladen.").strip()


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--request", type=Path, required=True)
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--status", type=Path, required=True)
    parser.add_argument("--chronyc", type=Path, default=Path("/usr/bin/chronyc"))
    args = parser.parse_args()

    enabled = False
    server = ""
    previous = args.source.read_bytes() if args.source.is_file() else None
    try:
        enabled, server = read_request(args.request)
        if enabled:
            atomic_write(args.source, f"server {server} iburst\n", 0o644)
        else:
            args.source.unlink(missing_ok=True)
        message = reload_sources(args.chronyc)
        write_status(args.status, "applied", enabled, server, message)
        return 0
    except Exception as error:
        try:
            if previous is None:
                args.source.unlink(missing_ok=True)
            else:
                atomic_write(args.source, previous.decode("utf-8"), 0o644)
            reload_sources(args.chronyc)
        except Exception:
            pass
        write_status(args.status, "failed", enabled, server, f"Übernahme fehlgeschlagen: {error}")
        print(f"Backup NTP source was not applied: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
