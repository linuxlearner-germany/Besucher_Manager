import { useState } from "react";
import { Link } from "react-router-dom";
import { Alert, Card } from "../components/ui";
import { AppLayout, type ApiError, fetchJson, useAuth } from "../app/core";

type ImportResult = {
  imported: number;
  needsReview: number;
  message: string;
  rows: Array<{
    rowNumber: number;
    visitId: string;
    visitorName: string;
    company: string;
    missingFields: string[];
    warnings: string[];
    needsReview: boolean;
  }>;
};

export function ImportPage() {
  const { user } = useAuth();
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);

  async function handleImport() {
    if (!importFile) {
      setError("Bitte CSV- oder Excel-Datei auswaehlen.");
      return;
    }

    setImporting(true);
    setError(null);
    setMessage(null);
    setImportResult(null);

    try {
      const body = new FormData();
      body.set("file", importFile);
      const payload = await fetchJson<ImportResult>(user ? "/api/sibe/visits/import" : "/api/public/visits/import", {
        method: "POST",
        body
      });
      setImportResult(payload);
      setMessage(payload.message);
      setImportFile(null);
    } catch (apiError) {
      const errorPayload = apiError as ApiError;
      setError(errorPayload.message || "Import konnte nicht verarbeitet werden.");
    } finally {
      setImporting(false);
    }
  }

  function downloadImportTemplateCsv() {
    window.location.href = user ? "/api/sibe/visits/import-template.csv" : "/api/public/visits/import-template.csv";
  }

  function downloadImportTemplateExcel() {
    window.location.href = user ? "/api/sibe/visits/import-template.xlsx" : "/api/public/visits/import-template.xlsx";
  }

  const detailBasePath = user?.role === "guard" || user?.role === "admin" ? "/wache/besuche" : "/sibe/besucher";

  return (
    <AppLayout>
      <main className="panel page-panel page-shell">
        <div className="section-header">
          <div>
            <h2>Besucher-Import</h2>
          </div>
        </div>

        {message ? <Alert type="success">{message}</Alert> : null}
        {error ? <Alert type="error">{error}</Alert> : null}

        <Card>
          <h3>Vorlagen</h3>
          <div className="row-actions">
            <button type="button" onClick={downloadImportTemplateExcel}>Excel-Vorlage herunterladen (Empfohlen)</button>
            <button type="button" className="secondary-button" onClick={downloadImportTemplateCsv}>CSV-Vorlage herunterladen</button>
          </div>
        </Card>

        <Card>
          <h3>Datei importieren</h3>
          <div className="toolbar filter-bar import-export-bar">
            <input
              type="file"
              accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
              onChange={(event) => setImportFile(event.target.files?.[0] ?? null)}
            />
            <button type="button" onClick={() => void handleImport()} disabled={importing || !importFile}>
              {importing ? "Importiert..." : "Besucher importieren"}
            </button>
          </div>
        </Card>

        {importResult && importResult.rows.length > 0 ? (
          <Card>
            <h3>Import-Ergebnis</h3>
            <p className="section-copy">{importResult.imported} Einträge verarbeitet, {importResult.needsReview} davon mit Nachbearbeitung.</p>
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Zeile</th>
                    <th>Besucher</th>
                    <th>Firma</th>
                    <th>Status</th>
                    <th>Aktion</th>
                  </tr>
                </thead>
                <tbody>
                  {importResult.rows.map((row) => (
                    <tr key={row.visitId}>
                      <td>{row.rowNumber}</td>
                      <td>{row.visitorName}</td>
                      <td>{row.company}</td>
                      <td>{row.needsReview ? [...row.missingFields, ...row.warnings].join(" ") || "Nachbearbeitung" : "Importiert"}</td>
                      <td>
                        {user ? (
                          <Link className="button-link" to={`${detailBasePath}/${row.visitId}`}>
                            Oeffnen
                          </Link>
                        ) : (
                          <span className="muted-text">Login fuer Details</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        ) : null}
      </main>
    </AppLayout>
  );
}
