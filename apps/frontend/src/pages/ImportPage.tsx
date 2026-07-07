import { useState } from "react";
import { Navigate } from "react-router-dom";
import { ImportReviewModal } from "../components/ImportReviewModal";
import { ImportResultCard } from "../components/import/ImportResultCard";
import { ImportTemplateCard } from "../components/import/ImportTemplateCard";
import type { ImportResult } from "../components/import/importTypes";
import { Alert } from "../components/ui";
import { AppLayout, type ApiError, fetchJson, useAuth } from "../app/core";

export function ImportPage() {
  const { user } = useAuth();
  if (user?.role === "kaskdt") {
    return <Navigate to="/kaskdt" replace />;
  }

  const [importFile, setImportFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [reviewModalOpen, setReviewModalOpen] = useState(false);

  async function handleImport() {
    if (!importFile) {
      setError("Bitte eine Excel-Datei auswählen.");
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
      setReviewModalOpen(payload.needsReview > 0);
    } catch (apiError) {
      const errorPayload = apiError as ApiError;
      setError(errorPayload.message || "Import konnte nicht verarbeitet werden.");
    } finally {
      setImporting(false);
    }
  }

  function downloadImportTemplateExcel() {
    window.location.href = user ? "/api/sibe/visits/import-template.xlsx" : "/api/public/visits/import-template.xlsx";
  }

  const detailBasePath = user?.role === "guard" || user?.role === "admin" ? "/wache/besuche" : "/sibe/besucher";

  return (
    <AppLayout>
      <main className="page-panel page-shell-wide">
        <section className="page-hero import-page-hero">
          <div className="page-hero-grid">
            <div className="page-hero-content">
              <h2>Besucherimport</h2>
            </div>
          </div>
        </section>

        {message ? <Alert type="success">{message}</Alert> : null}
        {error ? <Alert type="error">{error}</Alert> : null}

        <section className="import-upload-layout">
          <ImportTemplateCard
            onDownloadExcel={downloadImportTemplateExcel}
            importFile={importFile}
            importing={importing}
            onFileChange={setImportFile}
            onImport={() => void handleImport()}
            importDisabledHint="Bitte zuerst eine Excel-Datei auswählen."
          />
        </section>
        {importResult ? (
          <ImportResultCard
            result={importResult}
            detailBasePath={detailBasePath}
            canOpenDetails={Boolean(user)}
          />
        ) : null}

        {reviewModalOpen && importResult ? (
          <ImportReviewModal
            rows={importResult.rows}
            detailBasePath={user ? detailBasePath : null}
            showLoginHint={!user}
            onClose={() => setReviewModalOpen(false)}
          />
        ) : null}
      </main>
    </AppLayout>
  );
}
