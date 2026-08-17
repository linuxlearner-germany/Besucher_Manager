#!/usr/bin/env python3
"""Verify that startup/bootstrap keeps a changed admin password intact."""
from __future__ import annotations

import argparse
import http.cookiejar
import json
import urllib.error
import urllib.parse
import urllib.request


class Client:
    def __init__(self, base_url: str):
        self.base_url = base_url.rstrip("/")
        self.jar = http.cookiejar.CookieJar()
        self.opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(self.jar))

    def request(self, method: str, path: str, payload: dict | None = None) -> tuple[int, dict]:
        body = json.dumps(payload).encode() if payload is not None else None
        headers = {"Accept": "application/json", "Content-Type": "application/json", "User-Agent": "BesucherManager-bootstrap-check/1.0"}
        request = urllib.request.Request(f"{self.base_url}{path}", data=body, method=method, headers=headers)
        try:
            with self.opener.open(request) as response:
                raw = response.read()
                return response.status, json.loads(raw) if raw else {}
        except urllib.error.HTTPError as error:
            raw = error.read()
            try:
                return error.code, json.loads(raw)
            except json.JSONDecodeError:
                return error.code, {"message": raw.decode(errors="replace")}


def expect(status: int, expected: int, label: str, payload: dict) -> None:
    if status != expected:
        raise RuntimeError(f"{label}: expected {expected}, got {status}: {payload.get('message', 'request failed')}")


def login(client: Client, username: str, password: str, expected: int) -> None:
    status, payload = client.request("POST", "/api/auth/login", {"username": username, "password": password})
    expect(status, expected, f"login {username}", payload)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base-url", required=True)
    parser.add_argument("--username", required=True)
    parser.add_argument("--initial-password", required=True)
    parser.add_argument("--changed-password", required=True)
    parser.add_argument("--change", action="store_true")
    args = parser.parse_args()

    client = Client(args.base_url)
    if args.change:
        login(client, args.username, args.initial_password, 200)
        status, payload = client.request("PUT", "/api/auth/password", {"currentPassword": args.initial_password, "newPassword": args.changed_password, "confirmPassword": args.changed_password})
        expect(status, 200, "change admin password", payload)

    login(client, args.username, args.changed_password, 200)
    login(Client(args.base_url), args.username, args.initial_password, 401)
    print(json.dumps({"success": True, "changedPasswordAccepted": True, "initialPasswordRejected": True}))


if __name__ == "__main__":
    main()
