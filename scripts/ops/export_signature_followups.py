#!/usr/bin/env python3
"""
Exportiert unterschriftsrelevante Besuchsvorgaenge als CSV.

Standardmaessig werden Faelle mit:
- signed_later
- missing_exception
- pending

ueber die SiBe-API gelesen und als CSV ausgegeben oder in eine Datei geschrieben.
"""

from __future__ import annotations

import argparse
import csv
import http.cookiejar
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from typing import Any


@dataclass
class HttpClient:
    base_url: str

    def __post_init__(self) -> None:
        self.cookie_jar = http.cookiejar.CookieJar()
        self.opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(self.cookie_jar))

    def request(self, method: str, path: str, payload: dict[str, Any] | None = None) -> Any:
        headers = {"Accept": "application/json"}
        data = None
        if payload is not None:
            data = json.dumps(payload).encode("utf-8")
            headers["Content-Type"] = "application/json"
        req = urllib.request.Request(
            urllib.parse.urljoin(self.base_url, path),
            data=data,
            method=method,
            headers=headers,
        )
        with self.opener.open(req) as response:
            body = response.read().decode("utf-8")
            return json.loads(body) if body else None


def login(client: HttpClient, username: str, password: str) -> None:
    payload = client.request("POST", "/api/auth/login", {"username": username, "password": password})
    if not isinstance(payload, dict) or not payload.get("user"):
        raise RuntimeError("Anmeldung fuer den Export fehlgeschlagen.")


def main() -> int:
    parser = argparse.ArgumentParser(description="Exportiert unterschriftsrelevante Besuchsvorgaenge als CSV.")
    parser.add_argument("--base-url", default="http://localhost:3030")
    parser.add_argument("--user", default="sibe.demo")
    parser.add_argument("--password", default="Test1234!")
    parser.add_argument(
        "--statuses",
        nargs="+",
        default=["pending", "signed_later", "missing_exception"],
        choices=["pending", "signed_same_day", "signed_later", "missing_exception", "not_required"],
        help="Zu exportierende Unterschriftsstatus",
    )
    parser.add_argument("--output", default="-", help="CSV-Zieldatei oder - fuer stdout")
    args = parser.parse_args()

    client = HttpClient(args.base_url)
    login(client, args.user, args.password)

    rows: list[dict[str, Any]] = []
    for status in args.statuses:
        payload = client.request("GET", f"/api/sibe/visits?signatureStatus={urllib.parse.quote(status)}")
        for visit in payload.get("visits", []):
            rows.append({
                "visit_id": visit.get("id"),
                "badge_number": visit.get("badgeNumber") or "",
                "visitor_name": visit.get("visitorName"),
                "company": visit.get("company"),
                "gate": visit.get("gateName"),
                "host": visit.get("hostName"),
                "department": visit.get("hostDepartment"),
                "status": visit.get("status"),
                "signature_status": visit.get("hostSignatureStatus"),
                "valid_from": visit.get("validFrom"),
                "valid_until": visit.get("validUntil"),
                "check_in_at": visit.get("checkInAt") or "",
                "check_out_at": visit.get("checkOutAt") or "",
            })

    rows.sort(key=lambda entry: (entry["signature_status"], entry["valid_from"], entry["visitor_name"]))

    destination = sys.stdout if args.output == "-" else open(args.output, "w", newline="", encoding="utf-8")
    try:
        writer = csv.DictWriter(destination, fieldnames=[
            "visit_id",
            "badge_number",
            "visitor_name",
            "company",
            "gate",
            "host",
            "department",
            "status",
            "signature_status",
            "valid_from",
            "valid_until",
            "check_in_at",
            "check_out_at",
        ])
        writer.writeheader()
        writer.writerows(rows)
    finally:
        if destination is not sys.stdout:
            destination.close()

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
