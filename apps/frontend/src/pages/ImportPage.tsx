import { useEffect, useState } from "react";
import { ImportReviewModal } from "../components/ImportReviewModal";
import { ImportResultCard } from "../components/import/ImportResultCard";
import { ImportTemplateCard } from "../components/import/ImportTemplateCard";
import type { ImportResult } from "../components/import/importTypes";
import { Alert } from "../components/ui";
import { AppLayout, type ApiError, fetchJson, type Gate, useAuth } from "../app/core";

type SimplifiedRuleVisitor = {
  sourceExcelRowNumber?: number;
  firstName?: string;
  lastName?: string;
  company?: string;
  nationalityCode?: string;
  hostName?: string;
  hostPhone?: string;
  purpose?: string;
  validFrom?: string;
  validUntil?: string;
  notes?: string;
};

type SimplifiedRulePreview = {
  documentType: "event" | "construction";
  title: string;
  organization: string;
  location: string;
  validFrom: string;
  validUntil: string;
  hostName: string;
  hostPhone: string;
  notes: string;
  visitors: SimplifiedRuleVisitor[];
  warnings: string[];
};

export function ImportPage() {
  const { user } = useAuth();
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [reviewModalOpen, setReviewModalOpen] = useState(false);
  const [simplifiedRuleFile, setSimplifiedRuleFile] = useState<File | null>(null);
  const [simplifiedRulePreview, setSimplifiedRulePreview] = useState<SimplifiedRulePreview | null>(null);
  const [simplifiedRuleGateId, setSimplifiedRuleGateId] = useState("");
  const [simplifiedRuleLoading, setSimplifiedRuleLoading] = useState(false);
  const [simplifiedRuleImporting, setSimplifiedRuleImporting] = useState(false);
  const [gates, setGates] = useState<Gate[]>([]);

  useEffect(() => {
    if (user?.role !== "sibe") return;
    void fetchJson<{ gates: Gate[] }>("/api/public/gates", { method: "GET", headers: {} })
      .then((payload) => setGates(payload.gates))
      .catch(() => setGates([]));
  }, [user]);

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

  async function previewSimplifiedRule() {
    if (!simplifiedRuleFile || user?.role !== "sibe") {
      setError(user ? "Nur Sicherheitsbeauftragte dürfen PDF-Regelungen importieren." : "Bitte melden Sie sich für den PDF-Import an.");
      return;
    }
    setSimplifiedRuleLoading(true);
    setError(null);
    setMessage(null);
    try {
      const body = new FormData();
      body.set("file", simplifiedRuleFile);
      const preview = await fetchJson<SimplifiedRulePreview>("/api/sibe/visits/simplified-rule/preview", { method: "POST", body });
      setSimplifiedRulePreview(preview);
    } catch (apiError) {
      const errorPayload = apiError as ApiError;
      setError(errorPayload.message || "Die PDF-Datei konnte nicht gelesen werden.");
    } finally {
      setSimplifiedRuleLoading(false);
    }
  }

  async function importSimplifiedRule() {
    if (!simplifiedRulePreview || user?.role !== "sibe") return;
    if (!simplifiedRuleGateId) {
      setError("Bitte zuerst eine Wache auswählen.");
      return;
    }
    setSimplifiedRuleImporting(true);
    setError(null);
    setMessage(null);
    try {
      const payload = await fetchJson<ImportResult>("/api/sibe/visits/simplified-rule/import", {
        method: "POST",
        body: JSON.stringify({ gateId: simplifiedRuleGateId, visitors: simplifiedRulePreview.visitors })
      });
      setImportResult(payload);
      setMessage(payload.message);
      setReviewModalOpen(payload.needsReview > 0);
      setSimplifiedRuleFile(null);
      setSimplifiedRulePreview(null);
    } catch (apiError) {
      const errorPayload = apiError as ApiError;
      setError(errorPayload.message || "Die Besucherregelung konnte nicht importiert werden.");
    } finally {
      setSimplifiedRuleImporting(false);
    }
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
          {user?.role === "sibe" ? <section className="panel import-card">
            <div className="card-header-row"><h3>Vereinfachte Besucherregelung (PDF)</h3></div>
            <p className="section-copy">PDF der Veranstaltung oder Baumaßnahme auswählen. Namen, Firmen, Zeitraum und Ansprechpartner werden ausgelesen und vor dem Speichern angezeigt.</p>
            <label className="dropzone compact-dropzone">
              <input
                className="visually-hidden"
                type="file"
                accept=".pdf,application/pdf"
                disabled={user.role !== "sibe"}
                onChange={(event) => {
                  setSimplifiedRuleFile(event.target.files?.[0] ?? null);
                  setSimplifiedRulePreview(null);
                  event.target.value = "";
                }}
              />
              <div className="dropzone-copy"><strong>PDF-Datei auswählen</strong><span>PDF</span></div>
              {simplifiedRuleFile ? <div className="dropzone-selected"><span>Datei: {simplifiedRuleFile.name}</span></div> : null}
            </label>
            <div className="row-actions import-dropzone-actions import-actions-inline">
              <button type="button" onClick={() => void previewSimplifiedRule()} disabled={!simplifiedRuleFile || simplifiedRuleLoading}>
                {simplifiedRuleLoading ? "PDF wird gelesen..." : "PDF prüfen"}
              </button>
            </div>

            {simplifiedRulePreview ? (
              <div className="import-pdf-preview">
                <h4>Erkannte Angaben</h4>
                <div className="form-grid two-columns">
                  <div><strong>Art</strong><br />{simplifiedRulePreview.documentType === "construction" ? "Baumaßnahme" : "Veranstaltung"}</div>
                  <div><strong>Bezeichnung</strong><br />{simplifiedRulePreview.title || "-"}</div>
                  <div><strong>Firma / Organisation</strong><br />{simplifiedRulePreview.organization || "-"}</div>
                  <div><strong>Ort</strong><br />{simplifiedRulePreview.location || "-"}</div>
                  <div><strong>Zeitraum</strong><br />{simplifiedRulePreview.validFrom || "-"} bis {simplifiedRulePreview.validUntil || "-"}</div>
                  <div><strong>Ansprechperson</strong><br />{simplifiedRulePreview.hostName || "-"}{simplifiedRulePreview.hostPhone ? ` · ${simplifiedRulePreview.hostPhone}` : ""}</div>
                  <label><strong>Wache</strong><select value={simplifiedRuleGateId} onChange={(event) => setSimplifiedRuleGateId(event.target.value)}><option value="">Wache auswählen</option>{gates.map((gate) => <option key={gate.id} value={gate.id}>{gate.name}</option>)}</select></label>
                </div>
                {simplifiedRulePreview.warnings.map((warning) => <Alert key={warning} type="warning">{warning}</Alert>)}
                <div className="table-wrap"><table className="data-table compact-table"><thead><tr><th>Nr.</th><th>Nachname</th><th>Vorname</th><th>Firma / Organisation</th></tr></thead><tbody>{simplifiedRulePreview.visitors.map((visitor, index) => <tr key={`${visitor.sourceExcelRowNumber}-${index}`}><td>{visitor.sourceExcelRowNumber ?? index + 1}</td><td>{visitor.lastName || "-"}</td><td>{visitor.firstName || "-"}</td><td>{visitor.company || "-"}</td></tr>)}</tbody></table></div>
                <div className="row-actions"><button type="button" onClick={() => void importSimplifiedRule()} disabled={simplifiedRuleImporting || simplifiedRulePreview.visitors.length === 0}>{simplifiedRuleImporting ? "Importiert..." : `${simplifiedRulePreview.visitors.length} Besucher importieren`}</button></div>
              </div>
            ) : null}
          </section> : null}
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
