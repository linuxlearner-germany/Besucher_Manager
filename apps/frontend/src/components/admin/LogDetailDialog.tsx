import { useEffect } from "react";
import { type AdminLogDetail, formatRoleLabel } from "../../app/core";
import { Alert } from "../ui";

function displayValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "–";
  return String(value);
}

export function formatLogJson(value: unknown): string {
  if (value === null || value === undefined || value === "") return "–";
  if (typeof value === "string") {
    try {
      return JSON.stringify(JSON.parse(value), null, 2);
    } catch {
      return value;
    }
  }
  return JSON.stringify(value, null, 2);
}

function DetailItem({ label, value, wide = false }: { label: string; value: unknown; wide?: boolean }) {
  return <div className={wide ? "detail-span-2" : undefined}><dt>{label}</dt><dd>{displayValue(value)}</dd></div>;
}

export function LogDetailDialog({
  selectedId,
  detail,
  loading,
  error,
  onClose
}: {
  selectedId: string | null;
  detail: AdminLogDetail | null;
  loading: boolean;
  error: string | null;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!selectedId) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose, selectedId]);

  if (!selectedId) return null;
  const timestamp = detail?.timestamp ? new Date(detail.timestamp) : null;
  const validTimestamp = timestamp && !Number.isNaN(timestamp.getTime()) ? timestamp : null;

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="log-detail-title" onClick={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <div className="modal-card panel log-detail-modal">
        <div className="modal-header">
          <div>
            <h4 id="log-detail-title">{detail?.kind === "error" ? "Fehlerdetails" : "Audit-Details"}</h4>
            <p className="muted-text">Eintrag {selectedId}</p>
          </div>
          <button type="button" className="secondary-button modal-close-button" onClick={onClose}>Schließen</button>
        </div>

        {loading ? <div className="feedback info" role="status">Log-Details werden geladen…</div> : null}
        {error ? <Alert type="error">{error}</Alert> : null}
        {detail && !loading ? (
          <div className="log-detail-content">
            <section>
              <h5>Allgemein</h5>
              <dl className="detail-grid">
                <DetailItem label="Datum" value={validTimestamp?.toLocaleDateString("de-DE")} />
                <DetailItem label="Uhrzeit" value={validTimestamp?.toLocaleTimeString("de-DE")} />
                <DetailItem label="Benutzer" value={detail.username} />
                <DetailItem label="Benutzer-ID" value={detail.userId} />
                <DetailItem label="Rolle(n)" value={detail.roles?.length ? detail.roles.map(formatRoleLabel).join(", ") : null} />
                <DetailItem label="Aktion" value={detail.action} />
                <DetailItem label="Kategorie / Bereich" value={detail.category} />
                <DetailItem label="Ergebnis" value={detail.result} />
              </dl>
            </section>

            <section>
              <h5>Technisch</h5>
              <dl className="detail-grid">
                <DetailItem label="Log-/Audit-ID" value={detail.id} wide />
                <DetailItem label="Request-ID" value={detail.requestId} wide />
                <DetailItem label="HTTP-Methode" value={detail.httpMethod} />
                <DetailItem label="Endpoint" value={detail.endpoint} />
                <DetailItem label="HTTP-Status" value={detail.httpStatus} />
                <DetailItem label="Fehlercode" value={detail.errorCode} />
                <DetailItem label="Fehlermeldung" value={detail.errorMessage} wide />
                <DetailItem label="Source" value={detail.source} />
                <DetailItem label="Entity-Typ" value={detail.entityType} />
                <DetailItem label="Entity-/Datensatz-ID" value={detail.entityId} wide />
                <DetailItem label="IP-Adresse" value={detail.ipAddress} />
                <DetailItem label="User-Agent" value={detail.userAgent} wide />
              </dl>
            </section>

            <section>
              <h5>Metadaten</h5>
              <pre className="log-json-view">{formatLogJson(detail.metadata)}</pre>
            </section>
            <section>
              <h5>Technischer Kontext</h5>
              <pre className="log-json-view">{formatLogJson(detail.technicalContext)}</pre>
            </section>
          </div>
        ) : null}
      </div>
    </div>
  );
}
