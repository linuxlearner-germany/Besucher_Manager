#!/usr/bin/env python3
"""
Prueft grundlegende Rollen- und Zugriffssicherheit gegen die laufende App.

Getestet werden:
- unauthenticated
- guard
- sibe
- admin

Fokus liegt auf den Kern-APIs fuer den operativen MVP.
"""

from __future__ import annotations

import argparse
import http.cookiejar
import json
import sys
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from typing import Any

from env_loader import env_default


class ApiError(RuntimeError):
    def __init__(self, status: int, payload: Any):
        self.status = status
        self.payload = payload
        message = payload.get("message") if isinstance(payload, dict) else str(payload)
        super().__init__(f"{status}: {message}")


@dataclass
class HttpClient:
    base_url: str

    def __post_init__(self) -> None:
        self.cookie_jar = http.cookiejar.CookieJar()
        self.opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(self.cookie_jar))

    def request(self, method: str, path: str, payload: dict[str, Any] | None = None) -> tuple[int, Any]:
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
        try:
            with self.opener.open(req) as response:
                body = response.read().decode("utf-8")
                return response.status, json.loads(body) if body else None
        except urllib.error.HTTPError as error:
            body = error.read().decode("utf-8")
            try:
                payload = json.loads(body) if body else {"message": error.reason}
            except json.JSONDecodeError:
                payload = {"message": body or error.reason}
            return error.code, payload


def login(client: HttpClient, username: str, password: str, gate_name: str = "") -> None:
    status, payload = client.request("POST", "/api/auth/login", {"username": username, "password": password})
    if status != 200 or not isinstance(payload, dict):
        raise ApiError(status, payload)

    if payload.get("requiresGateSelection"):
        gates = payload.get("gates") or []
        if not gates:
            raise RuntimeError("Login verlangt Wache, liefert aber keine Wachen.")
        gate = next((entry for entry in gates if entry.get("name") == gate_name), None) if gate_name else None
        gate = gate or gates[0]
        status, payload = client.request("POST", "/api/auth/login", {"username": username, "password": password, "gateId": gate.get("id", "")})

    if status != 200 or not isinstance(payload, dict) or not payload.get("user"):
        raise ApiError(status, payload)


def assert_status(actual: int, expected: int, label: str) -> None:
    if actual != expected:
        raise RuntimeError(f"{label}: erwartet {expected}, erhalten {actual}")


def main() -> int:
    parser = argparse.ArgumentParser(description="Prueft Rollen- und Zugriffssicherheit der Besucher-App.")
    parser.add_argument("--base-url", default="http://localhost:3030")
    parser.add_argument("--gate-name", default="")
    parser.add_argument("--guard-user", default="guard.demo")
    parser.add_argument("--guard-password", default="Test1234!")
    parser.add_argument("--sibe-user", default="sibe.demo")
    parser.add_argument("--sibe-password", default="Test1234!")
    parser.add_argument("--admin-user", default=env_default("ADMIN_USERNAME", "admin"))
    parser.add_argument("--admin-password", default=env_default("ADMIN_PASSWORD", "StrongPassw0rd!"))
    args = parser.parse_args()

    unauth = HttpClient(args.base_url)
    guard = HttpClient(args.base_url)
    sibe = HttpClient(args.base_url)
    admin = HttpClient(args.base_url)

    print("1/4 Unauthenticated pruefen...")
    checks = [
        ("GET", "/api/guard/visits/today", 401, "unauth guard"),
        ("GET", "/api/sibe/summary", 401, "unauth sibe"),
        ("GET", "/api/admin/system-status", 401, "unauth admin"),
    ]
    for method, path, expected, label in checks:
        status, _payload = unauth.request(method, path)
        assert_status(status, expected, label)

    print("2/4 Guard pruefen...")
    login(guard, args.guard_user, args.guard_password, args.gate_name)
    guard_checks = [
        ("GET", "/api/guard/visits/today", 200, "guard own area"),
        ("GET", "/api/sibe/summary", 403, "guard blocked from sibe"),
        ("GET", "/api/admin/system-status", 403, "guard blocked from admin"),
    ]
    for method, path, expected, label in guard_checks:
        status, _payload = guard.request(method, path)
        assert_status(status, expected, label)

    print("3/4 SiBe pruefen...")
    login(sibe, args.sibe_user, args.sibe_password)
    sibe_checks = [
        ("GET", "/api/sibe/summary", 200, "sibe own area"),
        ("GET", "/api/guard/visits/today", 403, "sibe blocked from guard"),
        ("GET", "/api/admin/system-status", 403, "sibe blocked from admin"),
    ]
    for method, path, expected, label in sibe_checks:
        status, _payload = sibe.request(method, path)
        assert_status(status, expected, label)

    print("4/4 Admin pruefen...")
    login(admin, args.admin_user, args.admin_password)
    admin_checks = [
        ("GET", "/api/admin/system-status", 200, "admin system"),
        ("GET", "/api/sibe/summary", 200, "admin sibe access"),
        ("GET", "/api/guard/visits/today", 200, "admin guard access"),
    ]
    for method, path, expected, label in admin_checks:
        status, _payload = admin.request(method, path)
        assert_status(status, expected, label)

    print(json.dumps({"success": True, "checked": 12}, indent=2))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as error:  # pragma: no cover
        print(json.dumps({"success": False, "error": str(error)}, indent=2), file=sys.stderr)
        raise SystemExit(1)
