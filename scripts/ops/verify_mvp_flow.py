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
import io
import json
import time
import uuid
import sys
import urllib.error
import urllib.parse
import urllib.request
import zipfile
from dataclasses import dataclass
from typing import Any
from xml.sax.saxutils import escape

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

    def upload_file(
        self,
        path: str,
        *,
        field_name: str,
        filename: str,
        content: bytes,
        content_type: str,
        fields: dict[str, str] | None = None,
        headers: dict[str, str] | None = None,
    ) -> Any:
        boundary = f"----UploadBoundary{uuid.uuid4().hex}"
        request_headers = {
            "Accept": "application/json",
            "Content-Type": f"multipart/form-data; boundary={boundary}",
            **(headers or {}),
        }
        field_parts: list[bytes] = []
        for name, value in (fields or {}).items():
            field_parts.extend([
                f"--{boundary}\r\n".encode("utf-8"),
                f'Content-Disposition: form-data; name="{name}"\r\n\r\n'.encode("utf-8"),
                value.encode("utf-8"),
                b"\r\n",
            ])
        body = b"".join([*field_parts,
            f"--{boundary}\r\n".encode("utf-8"),
            f'Content-Disposition: form-data; name="{field_name}"; filename="{filename}"\r\n'.encode("utf-8"),
            f"Content-Type: {content_type}\r\n\r\n".encode("utf-8"),
            content,
            b"\r\n",
            f"--{boundary}--\r\n".encode("utf-8"),
        ])
        req = urllib.request.Request(
            urllib.parse.urljoin(self.base_url, path),
            data=body,
            method="POST",
            headers=request_headers,
        )
        try:
            with self.opener.open(req) as response:
                payload = response.read().decode("utf-8")
                return json.loads(payload) if payload else None
        except urllib.error.HTTPError as error:
            payload = error.read().decode("utf-8")
            try:
                error_payload = json.loads(payload) if payload else {"message": error.reason}
            except json.JSONDecodeError:
                error_payload = {"message": payload or error.reason}
            raise ApiError(error.code, error_payload) from error


def make_public_payload(suffix: str, gate_id: str) -> dict[str, Any]:
    now = dt.datetime.now().astimezone().replace(microsecond=0)
    valid_from = now - dt.timedelta(minutes=30)
    valid_until = now + dt.timedelta(hours=2)
    return {
        "gateId": gate_id,
        "firstName": "MVP",
        "lastName": f"Flow-{suffix}",
        "birthDate": "1990-05-10",
        "company": "Test Musterfirma",
        "nationalityCode": "DE",
        "visitorStreet": "Musterstraße",
        "visitorHouseNumber": "12",
        "visitorPostalCode": "30159",
        "visitorCity": "Hannover",
        "phone": "0123456789",
        "email": f"mvp-flow-{suffix}@example.com",
        "licensePlate": f"MVP-{suffix[-4:]}",
        "hostName": "Ansprechpartner Test",
        "hostEmail": "ansprechpartner@bundeswehr.org",
        "hostPhone": "0401234567",
        "hostDepartment": "Empfang",
        "purpose": "Automatischer MVP-Test",
        "validFrom": valid_from.isoformat(),
        "validUntil": valid_until.isoformat(),
        "idDocumentType": "identity_card",
        "idDocumentValidUntil": (dt.date.today() + dt.timedelta(days=365 * 2)).isoformat(),
        "idDocumentNumber": f"MVP{suffix[-6:]}",
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
        "company": "Test Musterfirma Aktualisiert",
        "nationalityCode": detail.get("nationalityCode") or "DE",
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


def excel_column_name(column_index: int) -> str:
    label = ""
    current = column_index
    while current > 0:
        current, remainder = divmod(current - 1, 26)
        label = chr(65 + remainder) + label
    return label


def build_inline_string_cell(reference: str, value: str) -> str:
    return f'<c r="{reference}" t="inlineStr"><is><t>{escape(value)}</t></is></c>'


def build_import_workbook(gate_name: str, suffix: str) -> bytes:
    today = dt.date.today().strftime("%d.%m.%Y")
    rows = [
        [
            "Vorname [Pflicht]",
            "Nachname [Pflicht]",
            "Firma / Organisation [Pflicht]",
            "Nationalität [Pflicht]",
            "Straße [Pflicht]",
            "Hausnummer [Pflicht]",
            "PLZ [Pflicht]",
            "Ort [Pflicht]",
            "Ansprechpartner [Pflicht]",
            "Ansprechpartner E-Mail [Pflicht]",
            "Ansprechpartner Telefon [Pflicht]",
            "Besuchszweck [Pflicht]",
            "Gültig von [Pflicht]",
            "Gültig bis [Pflicht]",
            "Wache [Optional]",
            "Ausweisart [Pflicht]",
            "Ausweis gültig bis [Pflicht]",
            "Ausweisnummer [Pflicht]",
        ],
        [
            "Import",
            f"Voll-{suffix}",
            "Test Import GmbH",
            "Deutschland",
            "Musterstraße",
            "12",
            "10115",
            "Berlin",
            "Import Ansprechpartner",
            "import.ansprechpartner@bundeswehr.org",
            "0401234567",
            "Importtest vollständig",
            today,
            today,
            gate_name,
            "Personalausweis",
            "31.12.2030",
            f"IMP{suffix[-6:]}A",
        ],
    ]
    sheet_rows: list[str] = []
    for row_index, values in enumerate(rows, start=1):
        cells = [
            build_inline_string_cell(f"{excel_column_name(column_index)}{row_index}", value)
            for column_index, value in enumerate(values, start=1)
        ]
        sheet_rows.append(f'<row r="{row_index}">{"".join(cells)}</row>')

    worksheet_xml = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
        f'<sheetData>{"".join(sheet_rows)}</sheetData>'
        "</worksheet>"
    )
    workbook_xml = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" '
        'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
        '<sheets><sheet name="Importvorlage" sheetId="1" r:id="rId1"/></sheets>'
        "</workbook>"
    )
    workbook_rels_xml = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>'
        '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>'
        "</Relationships>"
    )
    root_rels_xml = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'
        "</Relationships>"
    )
    content_types_xml = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
        '<Default Extension="xml" ContentType="application/xml"/>'
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
        '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
        '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'
        "</Types>"
    )
    styles_xml = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
        '<fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts>'
        '<fills count="1"><fill><patternFill patternType="none"/></fill></fills>'
        '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>'
        '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
        '<cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/></cellXfs>'
        '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>'
        "</styleSheet>"
    )

    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", compression=zipfile.ZIP_DEFLATED) as workbook:
        workbook.writestr("[Content_Types].xml", content_types_xml)
        workbook.writestr("_rels/.rels", root_rels_xml)
        workbook.writestr("xl/workbook.xml", workbook_xml)
        workbook.writestr("xl/_rels/workbook.xml.rels", workbook_rels_xml)
        workbook.writestr("xl/worksheets/sheet1.xml", worksheet_xml)
        workbook.writestr("xl/styles.xml", styles_xml)
    return buffer.getvalue()


def login(client: HttpClient, username: str, password: str, gate_name: str = "") -> dict[str, Any]:
    payload = client.request("POST", "/api/auth/login", payload={"username": username, "password": password})
    if payload.get("requiresGateSelection"):
        gates = payload.get("gates", [])
        if not gates:
            raise RuntimeError("Login verlangt Wache, liefert aber keine Wachen.")
        gate = next((entry for entry in gates if entry.get("name") == gate_name), None) if gate_name else None
        gate = gate or gates[0]
        payload = client.request("POST", "/api/auth/login", payload={"username": username, "password": password, "gateId": gate["id"]})
    return payload


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
    parser.add_argument("--admin-user", default=env_default("ADMIN_USERNAME", "admin"))
    parser.add_argument("--admin-password", default=env_default("ADMIN_PASSWORD", "StrongPassw0rd!"))
    parser.add_argument("--signature-status", default="signed_same_day", choices=["signed_same_day", "signed_later", "missing_exception", "not_required"])
    args = parser.parse_args()

    suffix = str(int(dt.datetime.now().timestamp()))
    public_client = HttpClient(args.base_url)
    guard_client = HttpClient(args.base_url)
    sibe_client = HttpClient(args.base_url)
    admin_client = HttpClient(args.base_url)

    print("1/16 Lade aktive Wachen und CSRF-Token...")
    gates_payload = public_client.request("GET", "/api/public/gates")
    gates = gates_payload.get("gates", [])
    csrf_token = gates_payload.get("csrfToken")
    if not gates or not csrf_token:
      raise RuntimeError("Keine aktiven Wachen oder kein CSRF-Token verfuegbar.")
    gate = None
    if args.gate_name:
        gate = next((entry for entry in gates if entry.get("name") == args.gate_name), None)
    if gate is None:
        gate = gates[0]

    print("2/16 Pruefe vollstaendigen oeffentlichen Excel-Import...")
    public_import_workbook = build_import_workbook(gate["name"], suffix)
    try:
        public_client.upload_file(
            "/api/public/visits/import/preview",
            field_name="file",
            filename="besucher-import-test.xlsx",
            content=public_import_workbook,
            content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        )
        raise RuntimeError("Oeffentliche Standardimport-Vorschau war ohne CSRF-Token erreichbar.")
    except ApiError as error:
        if error.status != 403 or error.payload.get("error") != "CSRF_INVALID":
            raise
    import_preview = public_client.upload_file(
        "/api/public/visits/import/preview",
        field_name="file",
        filename="besucher-import-test.xlsx",
        content=public_import_workbook,
        content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"X-CSRF-Token": csrf_token},
    )
    if int(import_preview.get("valid", 0)) != 1 or int(import_preview.get("invalid", 0)) != 0:
        raise RuntimeError("Oeffentliche Standardimport-Vorschau war unerwartet ungueltig.")
    import_result = public_client.upload_file(
        "/api/public/visits/import",
        field_name="file",
        filename="besucher-import-test.xlsx",
        content=public_import_workbook,
        content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"X-CSRF-Token": csrf_token},
    )
    if int(import_result.get("imported", 0)) != 1:
        raise RuntimeError("Oeffentlicher Import hat nicht genau einen vollstaendigen Eintrag verarbeitet.")
    if int(import_result.get("needsReview", 0)) != 0:
        raise RuntimeError("Vollstaendiger Import wurde unerwartet zur Nachbearbeitung markiert.")
    imported_rows = import_result.get("rows", [])
    if not imported_rows:
        raise RuntimeError("Import-Ergebnis enthaelt keinen Besuch.")
    imported_visit_id = imported_rows[0]["visitId"]

    print("3/16 Lege oeffentliche Voranmeldung an...")
    pre_registration = public_client.request(
        "POST",
        "/api/public/pre-registrations",
        payload=make_public_payload(suffix, gate["id"]),
        headers={"X-CSRF-Token": csrf_token, "User-Agent": "MVP-Flow-Check/1.0"},
    )
    visit_id = pre_registration["visitId"]
    visitor_id = pre_registration["visitorId"]

    print("4/16 Guard meldet sich an und findet den Besuch...")
    guard_login = login(guard_client, args.guard_user, args.guard_password, gate["name"])
    walk_in_save_payload = make_public_payload(f"walkin-save-{suffix}", gate["id"])
    walk_in_save_payload.update({
        "action": "save",
        "clientRequestId": f"walkin-save-{uuid.uuid4()}",
        "existingVisitorId": None,
        "validFrom": dt.date.today().isoformat(),
        "validUntil": dt.date.today().isoformat(),
    })
    walk_in_saved = guard_client.request("POST", "/api/guard/visits/walk-in", payload=walk_in_save_payload)
    if walk_in_saved.get("status") != "pre_registered":
        raise RuntimeError(f"Spontanbesucher wurde nicht gespeichert: {walk_in_saved}")
    walk_in_save_retry = guard_client.request("POST", "/api/guard/visits/walk-in", payload=walk_in_save_payload)
    if walk_in_save_retry.get("visitId") != walk_in_saved.get("visitId"):
        raise RuntimeError("Spontanbesucher-Speichern ist bei einem Retry nicht idempotent.")

    walk_in_payload = make_public_payload(f"walkin-checkin-{suffix}", gate["id"])
    walk_in_payload.update({
        "action": "check_in",
        "clientRequestId": f"walkin-checkin-{uuid.uuid4()}",
        "existingVisitorId": None,
        "validFrom": dt.date.today().isoformat(),
        "validUntil": dt.date.today().isoformat(),
    })
    walk_in = guard_client.request("POST", "/api/guard/visits/walk-in", payload=walk_in_payload)
    if walk_in.get("status") != "checked_in":
        raise RuntimeError(f"Spontanbesucher wurde nicht eingecheckt: {walk_in}")
    walk_in_retry = guard_client.request("POST", "/api/guard/visits/walk-in", payload=walk_in_payload)
    if walk_in_retry.get("visitId") != walk_in.get("visitId"):
        raise RuntimeError("Spontanbesucher-Check-in ist bei einem Retry nicht idempotent.")
    visits_payload = guard_client.request("GET", "/api/guard/visits/today?status=all")
    visits = visits_payload.get("visits", [])
    require_visit(visits, visit_id, "Wache-Tagesuebersicht")
    require_visit(visits, walk_in_saved["visitId"], "Wache-Tagesübersicht gespeicherter Spontanbesucher")
    require_visit(visits, walk_in["visitId"], "Wache-Tagesübersicht Spontanbesucher")
    pending_visits = guard_client.request("GET", "/api/guard/visits/today?status=all&signatureStatus=pending")["visits"]
    pending_visit = require_visit(pending_visits, visit_id, "Wache-Unterschriftsfilter vor Check-out")
    if pending_visit.get("hostSignatureStatus") != "pending":
        raise RuntimeError("Wache zeigt vor Check-out keinen offenen Unterschriftsstatus.")

    print("5/16 Guard aktualisiert Voranmeldedaten...")
    detail_before = guard_client.request("GET", f"/api/guard/visits/{visit_id}")["visit"]
    guard_client.request("PUT", f"/api/guard/visits/{visit_id}", payload=make_guard_update_payload(detail_before))

    print("6/16 SiBe prueft den Besuch...")
    login(sibe_client, args.sibe_user, args.sibe_password)
    sibe_client.request("GET", f"/api/sibe/visits/{visit_id}")

    print("7/16 SiBe sieht den vollstaendig importierten Datensatz...")
    imported_sibe_visit = require_visit(
        sibe_client.request("GET", "/api/sibe/visits?status=all")["visits"],
        imported_visit_id,
        "Importierter Besuch in SiBe-Liste",
    )
    if imported_sibe_visit.get("status") != "pre_registered":
        raise RuntimeError("Importierter Besuch ist in SiBe nicht vorangemeldet.")

    print("8/16 SiBe legt einen Besuch ohne Personendaten an...")
    today = dt.date.today().isoformat()
    simplified_visit = sibe_client.request(
        "POST",
        "/api/sibe/visits/simplified",
        payload={"gateId": gate["id"], "validFrom": today, "validUntil": today},
    )
    simplified_visit_id = simplified_visit["visitId"]
    require_visit(
        sibe_client.request("GET", "/api/sibe/visits?status=all")["visits"],
        simplified_visit_id,
        "Vereinfachter Besuch in SiBe-Liste",
    )
    require_visit(
        guard_client.request("GET", "/api/guard/visits/today?status=all")["visits"],
        simplified_visit_id,
        "Vereinfachter Besuch in Wachenliste",
    )

    print("9/16 SiBe prueft Vorschau und serverseitig neu geparsten XLSX-Import...")
    simplified_workbook = build_import_workbook(gate["name"], f"S{suffix}")
    preview = sibe_client.upload_file(
        "/api/sibe/visits/simplified-rule/preview",
        field_name="file",
        filename="vereinfachte-erfassung.xlsx",
        content=simplified_workbook,
        content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    )
    if not preview.get("visitors") or preview.get("errors"):
        raise RuntimeError(f"Vereinfachte XLSX-Vorschau unerwartet ungueltig: {preview.get('errors')}")
    simplified_import = sibe_client.upload_file(
        "/api/sibe/visits/simplified-rule/import",
        field_name="file",
        filename="vereinfachte-erfassung.xlsx",
        content=simplified_workbook,
        content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        fields={"gateId": gate["id"]},
    )
    if int(simplified_import.get("imported", 0)) != 1:
        raise RuntimeError("Vereinfachter XLSX-Import hat nicht genau einen Datensatz verarbeitet.")

    print("10/16 Guard checkt den Besucher ein...")
    check_in = guard_client.request("POST", f"/api/guard/visits/{visit_id}/check-in", payload={})
    if check_in.get("status") != "checked_in":
        raise RuntimeError("Check-in hat nicht den erwarteten Status geliefert.")

    print("11/16 Guard schreibt Druck-Audit...")
    guard_client.request("POST", f"/api/guard/visits/{visit_id}/print-log", payload={"paperSize": "A5"})

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

    print("12/16 Guard erfasst den Unterschriftsstatus waehrend des laufenden Besuchs...")
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

    print("13/16 Guard checkt mit Unterschriftsstatus aus und SiBe/Admin pruefen Nachvollziehbarkeit...")
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
    simplified_logs = admin_client.request("GET", f"/api/admin/audit-logs?search={simplified_visit_id}")["logs"]
    import_logs = admin_client.request("GET", "/api/admin/audit-logs?action=VISITS_IMPORTED_FROM_FILE")["logs"]
    audit_logs_by_id = {entry["id"]: entry for entry in [*visit_logs, *visitor_logs, *import_logs, *simplified_logs]}
    audit_logs = list(audit_logs_by_id.values())
    require_actions(
        audit_logs,
        {
            "PUBLIC_PRE_REGISTRATION_CREATED",
            "VISITS_IMPORTED_FROM_FILE",
            "SIBE_SIMPLIFIED_VISIT_CREATED",
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

    print("14/16 Pruefe Doppelrolle und Tombstone-Loeschung...")
    dual_username = f"dual.e2e.{suffix}"
    dual_password = "Test1234!"
    dual_created = admin_client.request("POST", "/api/admin/users", payload={
        "username": dual_username,
        "displayName": "Doppelrolle E2E",
        "email": f"{dual_username}@example.com",
        "password": dual_password,
        "role": "sibe",
        "roles": ["sibe", "kaskdt"],
    })
    dual_client = HttpClient(args.base_url)
    dual_login = login(dual_client, dual_username, dual_password)
    if set(dual_login.get("user", {}).get("roles", [])) != {"sibe", "kaskdt"}:
        raise RuntimeError("Login liefert die Doppelrolle nicht vollstaendig aus.")
    dual_client.request("GET", "/api/sibe/summary")
    dual_client.request("GET", "/api/kaskdt/simplified-visits?page=1&pageSize=5")
    dual_visit = dual_client.request("POST", "/api/sibe/visits/simplified", payload={
        "gateId": gate["id"], "validFrom": today, "validUntil": today,
    })
    if not dual_visit.get("visitId"):
        raise RuntimeError("Doppelrollen-Benutzer konnte keinen vereinfachten Besuch anlegen.")
    tombstone = admin_client.request("DELETE", f"/api/admin/users/{dual_created['id']}")
    if tombstone.get("deletionMode") != "tombstoned":
        raise RuntimeError("Historisch referenzierter Benutzer wurde nicht als Tombstone geloescht.")

    print("15/16 Pruefe physische Loeschung eines referenzfreien Benutzers...")
    disposable = admin_client.request("POST", "/api/admin/users", payload={
        "username": f"delete.e2e.{suffix}",
        "displayName": "Loeschtest E2E",
        "password": "Test1234!",
        "role": "guard",
        "roles": ["guard"],
    })
    hard_delete = admin_client.request("DELETE", f"/api/admin/users/{disposable['id']}")
    if hard_delete.get("deletionMode") != "hard_deleted":
        raise RuntimeError("Referenzfreier Benutzer wurde nicht physisch geloescht.")

    print("16/16 Pruefe Wartungsmodus, Admin-Bypass und erreichbaren Login...")
    admin_client.request("PUT", "/api/admin/system-settings/maintenance", payload={"maintenanceMode": True})
    try:
        status = public_client.request("GET", "/api/maintenance/status")
        if status.get("maintenanceMode") is not True:
            raise RuntimeError("Oeffentliche Wartungsstatus-Abfrage meldet den Modus nicht.")
        try:
            public_client.request("GET", "/api/public/gates")
            raise RuntimeError("Fachliche API blieb im Wartungsmodus erreichbar.")
        except ApiError as error:
            if error.status != 503 or error.payload.get("error") != "MAINTENANCE_MODE":
                raise
        for import_endpoint in ("/api/public/visits/import/preview", "/api/public/visits/import"):
            try:
                public_client.upload_file(
                    import_endpoint,
                    field_name="file",
                    filename="besucher-import-test.xlsx",
                    content=public_import_workbook,
                    content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                    headers={"X-CSRF-Token": csrf_token},
                )
                raise RuntimeError(f"Oeffentlicher Standardimport blieb im Wartungsmodus erreichbar: {import_endpoint}")
            except ApiError as error:
                if error.status != 503 or error.payload.get("error") != "MAINTENANCE_MODE":
                    raise
        for public_route in ("/", "/visit/simplified/application"):
            try:
                public_client.request("GET", public_route)
                raise RuntimeError(f"Öffentliche Seite blieb im Wartungsmodus erreichbar: {public_route}")
            except ApiError as error:
                if error.status != 503 or "Wartungsarbeiten" not in str(error.payload.get("message", error.payload)):
                    raise
        admin_client.request("GET", "/api/admin/system-status")
        login(HttpClient(args.base_url), args.sibe_user, args.sibe_password)
    finally:
        admin_client.request("PUT", "/api/admin/system-settings/maintenance", payload={"maintenanceMode": False})

    print("Zusatzpruefung: Audit-/Fehlerlog-Detailansicht und Berechtigungen...")
    detail_actions = [
        "SIBE_SIMPLIFIED_VISIT_CREATED",
        "USER_LOGIN_SUCCEEDED",
        "ADMIN_USER_CREATED",
        "MAINTENANCE_MODE_UPDATED",
    ]
    audit_detail_ids: list[str] = []
    for action in detail_actions:
        entries = admin_client.request("GET", f"/api/admin/audit-logs?action={urllib.parse.quote(action)}")["logs"]
        if not entries:
            raise RuntimeError(f"Kein Audit-Eintrag fuer Detailtest gefunden: {action}")
        audit_detail = admin_client.request("GET", f"/api/admin/audit-logs/{entries[0]['id']}")["log"]
        if audit_detail.get("id") != entries[0]["id"] or audit_detail.get("action") != action:
            raise RuntimeError(f"Audit-Detail liefert nicht den ausgewaehlten Eintrag: {action}")
        audit_detail_ids.append(entries[0]["id"])

    try:
        guard_client.request("GET", f"/api/admin/audit-logs/{audit_detail_ids[0]}")
        raise RuntimeError("Guard konnte Audit-Details ohne Berechtigung lesen.")
    except ApiError as error:
        if error.status != 403 or error.payload.get("error") != "FORBIDDEN":
            raise
    try:
        public_client.request("GET", f"/api/admin/audit-logs/{audit_detail_ids[0]}")
        raise RuntimeError("Nicht angemeldeter Client konnte Audit-Details lesen.")
    except ApiError as error:
        if error.status != 401 or error.payload.get("error") != "UNAUTHORIZED":
            raise
    try:
        admin_client.request("GET", f"/api/admin/audit-logs/{uuid.uuid4()}")
        raise RuntimeError("Unbekannte Audit-ID lieferte keinen 404-Fehler.")
    except ApiError as error:
        if error.status != 404 or error.payload.get("error") != "AUDIT_LOG_NOT_FOUND" or not error.payload.get("requestId"):
            raise

    try:
        admin_client.request("GET", "/api/admin/audit-logs?from=not-a-date")
    except ApiError as error:
        if error.status != 500:
            raise
    error_entries: list[dict[str, Any]] = []
    for _attempt in range(10):
        error_entries = admin_client.request("GET", "/api/admin/error-logs?errorCode=DATABASE_ERROR")["logs"]
        if error_entries:
            break
        time.sleep(0.2)
    if not error_entries:
        raise RuntimeError("Kein Fehlerlog fuer Detailtest erzeugt.")
    if any("v.status" in str(entry.get("message", "")) for entry in error_entries):
        raise RuntimeError("Walk-in-Regression: SQL-Alias v.status ist weiterhin fehlerhaft.")
    error_detail = admin_client.request("GET", f"/api/admin/error-logs/{error_entries[0]['id']}")["log"]
    if error_detail.get("id") != error_entries[0]["id"] or error_detail.get("result") != "failure":
        raise RuntimeError("Fehlerlog-Detail liefert nicht den ausgewaehlten Eintrag.")

    print(json.dumps({
        "success": True,
        "visitId": visit_id,
        "gate": gate["name"],
        "signatureStatus": args.signature_status,
        "auditEntriesFound": len(audit_logs),
        "logDetailsChecked": len(audit_detail_ids) + 1,
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
