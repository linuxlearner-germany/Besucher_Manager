#!/usr/bin/env python3
"""
Reproduzierbare MVP-Pruefung fuer den operativen Besucher-Flow.

Der Ablauf prueft gegen eine laufende Instanz:
1. aktive Wachen + CSRF-Token laden
2. oeffentliche Voranmeldung anlegen
3. Guard meldet sich an und findet den Besuch
4. Guard aktualisiert Besuchsdaten
5. Guard checkt ein
6. Guard schreibt Druck-Audit
7. Guard erfasst den Unterschriftsstatus waehrend des laufenden Besuchs
8. Guard checkt mit dem erfassten Unterschriftsstatus aus
9. SiBe/Admin pruefen Nachvollziehbarkeit

Nur Python-Standardbibliothek, kein Zusatzpaket noetig.
"""

from __future__ import annotations

import argparse
import datetime as dt
import http.cookiejar
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from typing import Any


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

    def request(
        self,
        method: str,
        path: str,
        *,
        payload: dict[str, Any] | None = None,
        headers: dict[str, str] | None = None,
    ) -> Any:
        request_headers = {"Accept": "application/json", **(headers or {})}
        data = None
        if payload is not None:
            data = json.dumps(payload).encode("utf-8")
            request_headers["Content-Type"] = "application/json"
        req = urllib.request.Request(
            urllib.parse.urljoin(self.base_url, path),
            data=data,
            method=method,
            headers=request_headers,
        )
        try:
            with self.opener.open(req) as response:
                body = response.read().decode("utf-8")
                if not body:
                    return None
                return json.loads(body)
        except urllib.error.HTTPError as error:
            body = error.read().decode("utf-8")
            try:
                payload = json.loads(body) if body else {"message": error.reason}
            except json.JSONDecodeError:
                payload = {"message": body or error.reason}
            raise ApiError(error.code, payload) from error


def make_public_payload(suffix: str) -> dict[str, Any]:
    now = dt.datetime.now().astimezone().replace(microsecond=0)
    valid_from = now - dt.timedelta(minutes=30)
    valid_until = now + dt.timedelta(hours=2)
    return {
        "firstName": "MVP",
        "lastName": f"Flow-{suffix}",
        "birthDate": "1990-05-10",
        "company": "Codex Musterfirma",
        "phone": "0123456789",
        "email": f"mvp-flow-{suffix}@example.com",
        "licensePlate": f"MVP-{suffix[-4:]}",
        "hostName": "Ansprechpartner Test",
        "hostEmail": "ansprechpartner@example.com",
        "hostPhone": "0401234567",
        "hostDepartment": "Empfang",
        "purpose": "Automatischer MVP-Test",
        "validFrom": valid_from.isoformat(),
        "validUntil": valid_until.isoformat(),
        "notes": "Automatisch angelegte Voranmeldung",
    }


def make_guard_update_payload(detail: dict[str, Any]) -> dict[str, Any]:
    valid_from = dt.datetime.fromisoformat(detail["validFrom"])
    valid_until = valid_from + dt.timedelta(hours=3)
    id_document_valid_until = dt.date.today() + dt.timedelta(days=365 * 3)
    return {
        "firstName": detail["firstName"],
        "lastName": "Flow-Aktualisiert",
        "birthDate": detail.get("birthDate") or "1990-05-10",
        "company": "Codex Musterfirma Aktualisiert",
        "phone": "0171000000",
        "email": "flow-updated@example.com",
        "licensePlate": "FLOW-UPD",
        "hostName": "Empfang Final",
        "hostEmail": "empfang.final@example.com",
        "hostPhone": "0407654321",
        "hostDepartment": "Wache",
        "purpose": "MVP-Flow mit Guard-Bearbeitung",
        "gateId": detail.get("gateId") or "",
        "validFrom": valid_from.isoformat(),
        "validUntil": valid_until.isoformat(),
        "notes": "Per Guard aktualisiert",
        "visitorStreet": "Musterstrasse",
        "visitorHouseNumber": "12",
        "visitorPostalCode": "30159",
        "visitorCity": "Hannover",
        "visitorAddress": "",
        "idDocumentType": "identity_card",
        "idDocumentValidUntil": id_document_valid_until.isoformat(),
        "idDocumentNumber": f"TEST{detail['id'][:8]}",
        "idDocumentIssuingPlace": "Hannover",
    }


def login(client: HttpClient, username: str, password: str) -> dict[str, Any]:
    return client.request("POST", "/api/auth/login", payload={"username": username, "password": password})


def require_actions(logs: list[dict[str, Any]], required_actions: set[str]) -> None:
    found = {entry.get("action") for entry in logs}
    missing = required_actions - found
    if missing:
        raise RuntimeError(f"Auditlog unvollstaendig, fehlend: {', '.join(sorted(missing))}")


def require_visit(visits: list[dict[str, Any]], visit_id: str, label: str) -> dict[str, Any]:
    for visit in visits:
        if visit.get("id") == visit_id:
            return visit
    raise RuntimeError(f"{label}: Besuch {visit_id} wurde nicht gefunden.")


def main() -> int:
    parser = argparse.ArgumentParser(description="Prueft den Besucher-MVP-Flow gegen eine laufende Instanz.")
    parser.add_argument("--base-url", default="http://localhost:3030", help="Basis-URL der App")
    parser.add_argument("--gate-name", default="", help="Bevorzugte aktive Wache")
    parser.add_argument("--guard-user", default="guard.demo")
    parser.add_argument("--guard-password", default="Test1234!")
    parser.add_argument("--sibe-user", default="sibe.demo")
    parser.add_argument("--sibe-password", default="Test1234!")
    parser.add_argument("--admin-user", default=os.environ.get("ADMIN_USERNAME", "admin"))
    parser.add_argument("--admin-password", default=os.environ.get("ADMIN_PASSWORD", "StrongPassw0rd!"))
    parser.add_argument("--signature-status", default="signed_same_day", choices=["signed_same_day", "signed_later", "missing_exception", "not_required"])
    args = parser.parse_args()

    suffix = str(int(dt.datetime.now().timestamp()))
    public_client = HttpClient(args.base_url)
    guard_client = HttpClient(args.base_url)
    sibe_client = HttpClient(args.base_url)
    admin_client = HttpClient(args.base_url)

    print("1/9 Lade aktive Wachen und CSRF-Token...")
    gates_payload = public_client.request("GET", "/api/public/gates")
    gates = gates_payload.get("gates", [])
    csrf_token = gates_payload.get("csrfToken")
    if not gates or not csrf_token:
      raise RuntimeError("Keine aktiven Wachen oder kein CSRF-Token verfuegbar.")

    guard_login = login(guard_client, args.guard_user, args.guard_password)
    guard_gate_id = guard_login.get("user", {}).get("gateId")
    gate = None
    if args.gate_name:
        gate = next((entry for entry in gates if entry.get("name") == args.gate_name), None)
    elif guard_gate_id:
        gate = next((entry for entry in gates if entry.get("id") == guard_gate_id), None)
    if gate is None:
        gate = gates[0]

    print("2/9 Lege oeffentliche Voranmeldung an...")
    pre_registration = public_client.request(
        "POST",
        "/api/public/pre-registrations",
        payload=make_public_payload(suffix),
        headers={"X-CSRF-Token": csrf_token, "User-Agent": "MVP-Flow-Check/1.0"},
    )
    visit_id = pre_registration["visitId"]
    visitor_id = pre_registration["visitorId"]

    print("3/9 Guard meldet sich an und findet den Besuch...")
    visits_payload = guard_client.request("GET", "/api/guard/visits/today?status=all")
    visits = visits_payload.get("visits", [])
    require_visit(visits, visit_id, "Wache-Tagesuebersicht")
    pending_visits = guard_client.request("GET", "/api/guard/visits/today?status=all&signatureStatus=pending")["visits"]
    pending_visit = require_visit(pending_visits, visit_id, "Wache-Unterschriftsfilter vor Check-out")
    if pending_visit.get("hostSignatureStatus") != "pending":
        raise RuntimeError("Wache zeigt vor Check-out keinen offenen Unterschriftsstatus.")

    print("4/9 Guard aktualisiert Voranmeldedaten...")
    detail_before = guard_client.request("GET", f"/api/guard/visits/{visit_id}")["visit"]
    guard_client.request("PUT", f"/api/guard/visits/{visit_id}", payload=make_guard_update_payload(detail_before))

    print("5/9 Guard checkt den Besucher ein...")
    check_in = guard_client.request("POST", f"/api/guard/visits/{visit_id}/check-in", payload={})
    if check_in.get("status") != "checked_in":
        raise RuntimeError("Check-in hat nicht den erwarteten Status geliefert.")

    print("6/9 Guard schreibt Druck-Audit...")
    guard_client.request("POST", f"/api/guard/visits/{visit_id}/print-log", payload={})

    signature_payload: dict[str, Any] = {
        "host_signature_status": args.signature_status,
        "checkout_note": "Automatischer MVP-Check",
    }
    if args.signature_status == "signed_later":
        signature_payload["host_signature_date"] = (dt.date.today() + dt.timedelta(days=1)).isoformat()
        signature_payload["host_signature_note"] = "Unterschrift wird nachgereicht"
    elif args.signature_status == "missing_exception":
        signature_payload["host_signature_note"] = "Ausnahme dokumentiert"
    elif args.signature_status == "not_required":
        signature_payload["host_signature_note"] = "Fachlich nicht erforderlich"

    print("7/9 Guard erfasst den Unterschriftsstatus waehrend des laufenden Besuchs...")
    guard_client.request(
        "PUT",
        f"/api/guard/visits/{visit_id}/signature",
        payload={
            key: value
            for key, value in signature_payload.items()
            if key != "checkout_note"
        },
    )
    detail_after_signature = guard_client.request("GET", f"/api/guard/visits/{visit_id}")["visit"]
    if detail_after_signature.get("status") != "checked_in":
        raise RuntimeError("Besuchsdetail blieb nach Signaturerfassung nicht im Status checked_in.")
    if detail_after_signature.get("hostSignatureStatus") != args.signature_status:
        raise RuntimeError("Besuchsdetail zeigt nach Signaturerfassung nicht den erwarteten Unterschriftsstatus.")
    signature_captured_at = detail_after_signature.get("hostSignatureConfirmedAt")
    signature_captured_by = detail_after_signature.get("hostSignatureConfirmedBy")
    if not signature_captured_at or not signature_captured_by:
        raise RuntimeError("Signaturerfassung hat keinen bestaetigenden Benutzer oder Zeitstempel hinterlegt.")

    print("8/9 Guard checkt mit Unterschriftsstatus aus...")
    check_out = guard_client.request(
        "POST",
        f"/api/guard/visits/{visit_id}/check-out",
        payload={
            "signed_by_host_confirmed": True,
            "returned_badge_number": detail_after_signature["badgeNumber"],
        },
    )
    if check_out.get("status") != "checked_out":
        raise RuntimeError("Check-out hat nicht den erwarteten Status geliefert.")

    detail_after = guard_client.request("GET", f"/api/guard/visits/{visit_id}")["visit"]
    if detail_after.get("status") != "checked_out":
        raise RuntimeError("Besuchsdetail zeigt nicht checked_out.")
    if detail_after.get("hostSignatureStatus") != args.signature_status:
        raise RuntimeError("Besuchsdetail zeigt nicht den erwarteten Unterschriftsstatus.")
    if detail_after.get("hostSignatureConfirmedAt") != signature_captured_at:
        raise RuntimeError("Check-out hat den Signatur-Zeitstempel unerwartet ueberschrieben.")
    if detail_after.get("hostSignatureConfirmedBy") != signature_captured_by:
        raise RuntimeError("Check-out hat den Signatur-Benutzer unerwartet ueberschrieben.")
    filtered_after_checkout = guard_client.request(
        "GET",
        f"/api/guard/visits/today?status=all&signatureStatus={urllib.parse.quote(args.signature_status)}",
    )["visits"]
    require_visit(filtered_after_checkout, visit_id, "Wache-Unterschriftsfilter nach Check-out")

    print("9/9 SiBe/Admin pruefen Nachvollziehbarkeit...")
    login(sibe_client, args.sibe_user, args.sibe_password)
    sibe_summary = sibe_client.request("GET", "/api/sibe/summary")
    sibe_visits = sibe_client.request(
        "GET",
        f"/api/sibe/visits?signatureStatus={urllib.parse.quote(args.signature_status)}",
    )["visits"]
    require_visit(sibe_visits, visit_id, "SiBe-Filter")
    summary_key = {
        "signed_later": "signaturesFollowUp",
        "missing_exception": "signaturesExceptions",
        "signed_same_day": None,
        "not_required": None,
    }[args.signature_status]
    if summary_key and int(sibe_summary.get(summary_key, 0)) < 1:
        raise RuntimeError(f"SiBe-Dashboard meldet keinen Wert fuer {summary_key}.")

    login(admin_client, args.admin_user, args.admin_password)
    admin_system = admin_client.request("GET", "/api/admin/system-status")
    visit_logs = admin_client.request("GET", f"/api/admin/audit-logs?search={visit_id}")["logs"]
    visitor_logs = admin_client.request("GET", f"/api/admin/audit-logs?search={visitor_id}")["logs"]
    audit_logs_by_id = {entry["id"]: entry for entry in [*visit_logs, *visitor_logs]}
    audit_logs = list(audit_logs_by_id.values())
    require_actions(
        audit_logs,
        {
            "PUBLIC_PRE_REGISTRATION_CREATED",
            "VISITOR_UPDATED_BY_GUARD",
            "VISIT_UPDATED_BY_GUARD",
            "VISIT_CHECKED_IN",
            "VISIT_BADGE_PRINTED",
            "VISIT_SIGNATURE_UPDATED",
            "VISIT_CHECKED_OUT",
        },
    )
    if summary_key and int(admin_system.get(summary_key, 0)) < 1:
        raise RuntimeError(f"Admin-Systemstatus meldet keinen Wert fuer {summary_key}.")

    print(json.dumps({
        "success": True,
        "visitId": visit_id,
        "gate": gate["name"],
        "signatureStatus": args.signature_status,
        "auditEntriesFound": len(audit_logs),
        "sibeSummary": {summary_key: sibe_summary.get(summary_key)} if summary_key else {},
        "adminSummary": {summary_key: admin_system.get(summary_key)} if summary_key else {},
    }, indent=2))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as error:  # pragma: no cover - CLI error path
        print(json.dumps({"success": False, "error": str(error)}, indent=2), file=sys.stderr)
        raise SystemExit(1)
