import { useState } from "react";
import { ImportReviewModal } from "../ImportReviewModal";
import { Alert } from "../ui";
import { ImportResultCard } from "./ImportResultCard";
import { ImportTemplateCard } from "./ImportTemplateCard";
import type { ImportResult } from "./importTypes";
import { canUseNormalVisitorImport, fetchJson, useAuth, type ApiError } from "../../app/core";

type NormalImportPreview = {
  rows: Array<{
    rowNumber: number;
    firstName: string;
    lastName: string;
    company: string;
    validFrom: string;
    validUntil: string;
    gateName: string;
    hostName: string;
    status: "ok" | "error";
    errors: string[];
  }>;
  total: number;
  valid: number;
  invalid: number;
  errors: string[];
  ignoredSampleRows: number;
};

export function NormalVisitorImportSection() {
  const { user } = useAuth();
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [preview, setPreview] = useState<NormalImportPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [reviewModalOpen, setReviewModalOpen] = useState(false);

  if (!canUseNormalVisitorImport(user)) {
    return null;
  }

  async function handleImport() {
    if (!importFile || !preview || preview.invalid > 0) {
      setError("Bitte zuerst eine fehlerfreie Vorschau anzeigen.");
      return;
    }

    setImporting(true);
    setError(null);
    setMessage(null);
    setImportResult(null);

    try {
      const body = new FormData();
      body.set("file", importFile);
      const payload = await fetchJson<ImportResult>("/api/sibe/visits/import", {
        method: "POST",
        body
      });
      setImportResult(payload);
      setMessage(payload.message);
      setImportFile(null);
      setPreview(null);
      setReviewModalOpen(payload.needsReview > 0);
    } catch (apiError) {
      const errorPayload = apiError as ApiError;
      setError(errorPayload.message || "Der XLSX-Import konnte nicht verarbeitet werden.");
    } finally {
      setImporting(false);
    }
  }

  async function handlePreview() {
    if (!importFile) {
      setError("Bitte zuerst eine XLSX-Datei auswählen.");
      return;
    }

    setPreviewing(true);
    setPreview(null);
    setError(null);
    setMessage(null);
    setImportResult(null);

    try {
      const body = new FormData();
      body.set("file", importFile);
      const payload = await fetchJson<NormalImportPreview>("/api/sibe/visits/import/preview", {
        method: "POST",
        body
      });
      setPreview(payload);
      if (payload.invalid > 0) {
        setError("Die Vorschau enthält fehlerhafte Zeilen. Bitte korrigieren Sie die XLSX-Datei und laden Sie sie erneut hoch.");
      }
    } catch (apiError) {
      const errorPayload = apiError as ApiError;
      setError(errorPayload.message || "Die XLSX-Datei konnte nicht geprüft werden.");
    } finally {
      setPreviewing(false);
    }
  }

  function downloadImportTemplateExcel() {
    window.location.href = "/api/sibe/visits/import-template.xlsx";
  }

  const detailBasePath = user?.role === "guard" || user?.role === "admin" ? "/wache/besuche" : "/sibe/besucher";

  return (
    <section className="normal-import-section" aria-labelledby="normal-import-title">
      <div className="section-header normal-import-heading">
        <div>
          <h2 id="normal-import-title">Besucher per XLSX importieren</h2>
          <p className="section-copy">Alternativ können Sie mehrere Besucher gesammelt über eine XLSX-Datei importieren.</p>
        </div>
      </div>

      {message ? <Alert type="success">{message}</Alert> : null}
      {error ? <Alert type="error">{error}</Alert> : null}

      <ImportTemplateCard
        onDownloadExcel={downloadImportTemplateExcel}
        importFile={importFile}
        importing={importing}
        previewing={previewing}
        previewReady={Boolean(preview && preview.invalid === 0)}
        onFileChange={(file) => {
          setImportFile(file);
          setPreview(null);
          setError(null);
          setMessage(null);
        }}
        onPreview={() => void handlePreview()}
        onImport={() => void handleImport()}
        importDisabledHint="Bitte zuerst eine XLSX-Datei auswählen."
      />

      {preview ? (
        <section className="normal-import-preview" aria-labelledby="normal-import-preview-title">
          <div className="section-header">
            <div>
              <h3 id="normal-import-preview-title">Vorschau</h3>
              <p className="section-copy">{preview.total} Besucherzeile(n) erkannt: {preview.valid} gültig, {preview.invalid} fehlerhaft.</p>
            </div>
            {preview.ignoredSampleRows > 0 ? <span className="inline-note">{preview.ignoredSampleRows} unveränderte Musterzeile(n) ignoriert</span> : null}
          </div>
          {preview.errors.length > 0 ? <Alert type="error">{preview.errors.join(" ")}</Alert> : null}
          <div className="table-wrap">
            <table className="data-table compact-table">
              <thead>
                <tr><th>Zeile</th><th>Name</th><th>Firma</th><th>Zeitraum</th><th>Wache</th><th>Ansprechpartner</th><th>Status</th></tr>
              </thead>
              <tbody>
                {preview.rows.map((row) => (
                  <tr key={row.rowNumber}>
                    <td>{row.rowNumber}</td>
                    <td>{[row.firstName, row.lastName].filter(Boolean).join(" ") || "-"}</td>
                    <td>{row.company || "-"}</td>
                    <td>{[row.validFrom, row.validUntil].filter(Boolean).join(" – ") || "-"}</td>
                    <td>{row.gateName || "-"}</td>
                    <td>{row.hostName || "-"}</td>
                    <td>
                      <span className={`preview-status preview-status-${row.status}`}>
                        {row.status === "ok" ? "OK" : "Fehler"}
                      </span>
                      {row.errors.length > 0 ? <div className="preview-row-errors">{row.errors.join(" ")}</div> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {importResult ? (
        <ImportResultCard
          result={importResult}
          detailBasePath={detailBasePath}
          canOpenDetails
        />
      ) : null}

      {reviewModalOpen && importResult ? (
        <ImportReviewModal
          rows={importResult.rows}
          detailBasePath={detailBasePath}
          onClose={() => setReviewModalOpen(false)}
        />
      ) : null}
    </section>
  );
}
