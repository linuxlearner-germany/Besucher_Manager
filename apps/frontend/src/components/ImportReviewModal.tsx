import { type ReactNode } from "react";
import { Link } from "react-router-dom";

type ImportReviewRow = {
  rowNumber: number;
  visitId: string;
  visitorName: string;
  company: string;
  missingFields: string[];
  warnings: string[];
  needsReview: boolean;
};

type ImportReviewModalProps = {
  title?: string;
  rows: ImportReviewRow[];
  onClose: () => void;
  detailBasePath?: string | null;
  showLoginHint?: boolean;
};

function buildStatusText(row: ImportReviewRow): string {
  const parts = [...row.missingFields, ...row.warnings].filter(Boolean);
  return parts.length ? parts.join(" ") : "Nachbearbeitung erforderlich";
}

export function ImportReviewModal({
  title = "Nachbearbeitung erforderlich",
  rows,
  onClose,
  detailBasePath,
  showLoginHint = false
}: ImportReviewModalProps) {
  const reviewRows = rows.filter((row) => row.needsReview);
  const firstReviewRow = reviewRows[0] ?? null;

  if (!reviewRows.length) {
    return null;
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" onClick={(event) => {
      if (event.target === event.currentTarget) {
        onClose();
      }
    }}>
      <div className="modal-card panel import-review-modal">
        <div className="modal-header">
          <h4>{title}</h4>
          <button type="button" className="secondary-button modal-close-button" onClick={onClose}>Schließen</button>
        </div>

        <div className="import-review-stack">
          <p className="section-copy">
            {reviewRows.length} Einträge brauchen noch Ergänzungen oder Prüfung.
          </p>

          {showLoginHint ? (
            <AlertNote>
              Für die direkte Nachbearbeitung ist eine Anmeldung an der Wache, im SiBe- oder Admin-Bereich erforderlich.
            </AlertNote>
          ) : null}

          <div className="import-review-list">
            {reviewRows.map((row) => (
              <article key={row.visitId} className="import-review-item">
                <div className="import-review-item-header">
                  <div>
                    <strong>{row.visitorName}</strong>
                    <p>{row.company || "-"}</p>
                  </div>
                  <span className="field-config-badge">Zeile {row.rowNumber}</span>
                </div>
                <p className="import-review-status">{buildStatusText(row)}</p>
                {detailBasePath ? (
                  <div className="row-actions import-review-actions">
                    <Link className="button-link" to={`${detailBasePath}/${row.visitId}`}>
                      Besuch öffnen
                    </Link>
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        </div>

        <div className="row-actions action-bar modal-actions">
          {detailBasePath && firstReviewRow ? (
            <Link className="button-link" to={`${detailBasePath}/${firstReviewRow.visitId}`}>
              Erste Nachbearbeitung öffnen
            </Link>
          ) : null}
          <button type="button" className="secondary-button" onClick={onClose}>
            Schließen
          </button>
        </div>
      </div>
    </div>
  );
}

function AlertNote({ children }: { children: ReactNode }) {
  return <div className="feedback info">{children}</div>;
}
