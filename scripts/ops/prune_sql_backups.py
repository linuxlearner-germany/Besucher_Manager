#!/usr/bin/env python3
"""Safely retain verified Besucher-Manager SQL backups."""

from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import re
from pathlib import Path

SENTINEL_NAME = ".besucher-manager-backup-root"
SENTINEL_VALUE = "besucher-manager-sql-backups-v1\n"


def file_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def main() -> int:
    parser = argparse.ArgumentParser(description="Retention fuer verifizierte SQL-Backups")
    parser.add_argument("--backup-dir", required=True)
    parser.add_argument("--database", required=True)
    parser.add_argument("--apply", action="store_true", help="Ausgewaehlte Backups wirklich entfernen")
    parser.add_argument("--recent", type=int, default=7, help="Neueste Backups immer behalten")
    parser.add_argument("--daily-days", type=int, default=14, help="Ein Backup je Tag behalten")
    parser.add_argument("--weekly-weeks", type=int, default=8, help="Ein Backup je ISO-Woche behalten")
    args = parser.parse_args()

    if not re.fullmatch(r"[A-Za-z0-9_]+", args.database):
        raise SystemExit("Ungueltiger Datenbankname; Retention abgebrochen.")
    if args.recent < 1 or args.daily_days < 0 or args.weekly_weeks < 0:
        raise SystemExit("Ungueltige Retention-Werte; mindestens ein aktuelles Backup muss bleiben.")

    backup_dir = Path(args.backup_dir).resolve(strict=True)
    if backup_dir == Path("/") or backup_dir == Path.home().resolve():
        raise SystemExit("Unsicheres Backup-Verzeichnis; Retention abgebrochen.")
    sentinel = backup_dir / SENTINEL_NAME
    if not sentinel.is_file() or sentinel.read_text(encoding="utf-8") != SENTINEL_VALUE:
        raise SystemExit("Backup-Verzeichnis besitzt keine gueltige Besucher-Manager-Sicherheitsmarkierung.")

    filename_pattern = re.compile(rf"^{re.escape(args.database)}_(\d{{8}})_(\d{{6}})\.bak$")
    verified: list[tuple[dt.datetime, Path, Path]] = []
    unverified = 0
    for backup in backup_dir.iterdir():
        match = filename_pattern.fullmatch(backup.name)
        if not match or not backup.is_file() or backup.is_symlink():
            continue
        marker = backup.with_name(f"{backup.name}.verified.sha256")
        if not marker.is_file() or marker.is_symlink():
            unverified += 1
            continue
        marker_parts = marker.read_text(encoding="ascii").strip().split()
        if len(marker_parts) != 2 or marker_parts[1] != backup.name or marker_parts[0] != file_sha256(backup):
            print(f"WARN: Verifikationsmarker ungueltig, wird nicht geloescht: {backup.name}")
            unverified += 1
            continue
        timestamp = dt.datetime.strptime("".join(match.groups()), "%Y%m%d%H%M%S")
        verified.append((timestamp, backup, marker))

    verified.sort(key=lambda item: item[0], reverse=True)
    if not verified:
        print(f"Keine verifizierten {args.database}-Backups fuer Retention gefunden; nichts geloescht.")
        return 0

    keep: set[Path] = {item[1] for item in verified[: args.recent]}
    newest_time = verified[0][0]
    kept_days: set[dt.date] = set()
    kept_weeks: set[tuple[int, int]] = set()
    for timestamp, backup, _marker in verified:
        age = newest_time - timestamp
        if age.days < args.daily_days and timestamp.date() not in kept_days:
            keep.add(backup)
            kept_days.add(timestamp.date())
        iso = timestamp.isocalendar()
        week = (iso.year, iso.week)
        if age.days < args.weekly_weeks * 7 and week not in kept_weeks:
            keep.add(backup)
            kept_weeks.add(week)

    candidates = [item for item in verified if item[1] not in keep]
    if len(verified) - len(candidates) < 1:
        raise SystemExit("Retention wuerde das letzte verifizierte Backup entfernen; abgebrochen.")

    mode = "APPLY" if args.apply else "DRY-RUN"
    print(f"Retention {mode}: {len(keep)} verifiziert behalten, {len(candidates)} zum Entfernen, {unverified} unverifiziert unangetastet.")
    for _timestamp, backup, marker in candidates:
        if backup.parent.resolve() != backup_dir or marker.parent.resolve() != backup_dir:
            raise SystemExit("Datei ausserhalb des markierten Backup-Verzeichnisses erkannt; abgebrochen.")
        print(f"{mode}: {backup.name}")
        if args.apply:
            backup.unlink()
            marker.unlink()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
