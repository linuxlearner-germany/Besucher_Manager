import { type DragEvent, type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { AppLayout, type ApiError, extractFieldErrors, fetchJson, formatDateOnly } from "../app/core";
import { Alert, Button, Card, DataTable, FormField } from "../components/ui";

type PreviewRow = {
  rowNumber: number;
  firstName: string | null;
  lastName: string | null;
  company: string | null;
  validFrom: string | null;
  validUntil: string | null;
  gateName: string | null;
  hostName: string | null;
  hostDepartment: string | null;
  licensePlate: string | null;
  warnings: string[];
  errors: string[];
};

type Preview = { rows: PreviewRow[]; valid: boolean; ignoredSampleRows: number };
type Bootstrap = {
  csrfToken: string;
  requireEmailVerification: boolean;
  limits: { maxBytes: number; maxRows: number; maxSheets: number };
};
type Result = { reference: string; status: string; emailVerificationRequired: boolean; entryCount: number };

const steps = ["Vorlage herunterladen", "Datei hochladen", "Daten prüfen", "Kontaktdaten", "Antrag absenden"];

function displayPeriod(from: string | null, until: string | null) {
  if (!from && !until) return "–";
  return `${from ? formatDateOnly(from) : "–"} – ${until ? formatDateOnly(until) : "–"}`;
}

function formatFileSize(size: number) {
  return size < 1024 * 1024
    ? `${new Intl.NumberFormat("de-DE", { maximumFractionDigits: 0 }).format(size / 1024)} KB`
    : `${new Intl.NumberFormat("de-DE", { maximumFractionDigits: 1 }).format(size / 1024 / 1024)} MB`;
}

export function PublicSimplifiedApplicationPage() {
  const [bootstrap, setBootstrap] = useState<Bootstrap | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState<"preview" | "submit" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [templateDownloaded, setTemplateDownloaded] = useState(false);
  const [applicantEmail, setApplicantEmail] = useState("");
  const [applicantEmailValid, setApplicantEmailValid] = useState(false);
  const [applicantEmailTouched, setApplicantEmailTouched] = useState(false);
  const [applicantEmailServerError, setApplicantEmailServerError] = useState<string | null>(null);
  const [applicantName, setApplicantName] = useState("");
  const [applicantOrganization, setApplicantOrganization] = useState("");
  const [applicantNote, setApplicantNote] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const applicantEmailRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void fetchJson<Bootstrap>("/api/public/simplified-applications/bootstrap", { headers: {} })
      .then(setBootstrap)
      .catch(() => setError("Die Antragsseite konnte nicht vorbereitet werden. Bitte laden Sie die Seite neu."));
  }, []);

  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);

  const summary = useMemo(() => {
    if (!preview) return null;
    const errorRows = preview.rows.filter((row) => row.errors.length > 0).length;
    const warningRows = preview.rows.filter((row) => row.errors.length === 0 && row.warnings.length > 0).length;
    const validRows = preview.rows.length - errorRows - warningRows;
    const starts = preview.rows.map((row) => row.validFrom).filter((value): value is string => Boolean(value)).sort();
    const ends = preview.rows.map((row) => row.validUntil).filter((value): value is string => Boolean(value)).sort();
    return { errorRows, warningRows, validRows, period: displayPeriod(starts[0] ?? null, ends.at(-1) ?? null) };
  }, [preview]);

  const applicantEmailError = applicantEmailServerError
    ?? (applicantEmailTouched && !applicantEmailValid
      ? applicantEmail.trim()
        ? "Bitte geben Sie eine gültige E-Mail-Adresse ein."
        : "Bitte geben Sie Ihre E-Mail-Adresse ein."
      : undefined);
  const currentStep = result ? 5 : !file ? 1 : !preview ? 2 : !preview.valid ? 3 : applicantEmailValid ? 5 : 4;
  const limits = bootstrap?.limits ?? { maxBytes: 5 * 1024 * 1024, maxRows: 500, maxSheets: 3 };

  function selectFile(nextFile: File | null) {
    setFile(nextFile);
    setPreview(null);
    setResult(null);
    setError(null);
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    if (busy) return;
    selectFile(event.dataTransfer.files[0] ?? null);
  }

  async function upload(path: string, form: FormData) {
    return fetchJson(path, { method: "POST", headers: { "X-CSRF-Token": bootstrap?.csrfToken ?? "" }, body: form });
  }

  async function inspect() {
    if (!file) {
      setError("Bitte wählen Sie zuerst eine XLSX-Datei aus.");
      return;
    }
    setBusy("preview");
    setError(null);
    setResult(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const nextPreview = await upload("/api/public/simplified-applications/preview", form) as Preview;
      setPreview(nextPreview);
      window.requestAnimationFrame(() => previewRef.current?.focus());
    } catch (reason) {
      const api = reason as ApiError;
      setPreview(null);
      setError(api.message || "Die Datei konnte nicht gelesen werden. Bitte verwenden Sie die aktuelle XLSX-Vorlage.");
    } finally {
      setBusy(null);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file || !preview?.valid) {
      setError("Bitte prüfen und korrigieren Sie die Datei vor dem Absenden.");
      return;
    }
    if (!applicantEmailValid) {
      setApplicantEmailTouched(true);
      applicantEmailRef.current?.focus();
      return;
    }
    setBusy("submit");
    setError(null);
    const data = new FormData();
    data.set("file", file);
    data.set("applicantEmail", applicantEmail);
    data.set("applicantName", applicantName);
    data.set("applicantOrganization", applicantOrganization);
    data.set("applicantNote", applicantNote);
    try {
      setResult(await upload("/api/public/simplified-applications", data) as Result);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (reason) {
      const api = reason as ApiError;
      const fieldErrors = extractFieldErrors(api);
      if (fieldErrors.applicantEmail) {
        setApplicantEmailServerError(fieldErrors.applicantEmail);
        setApplicantEmailTouched(true);
        applicantEmailRef.current?.focus();
      }
      setError(api.message || "Der Antrag konnte nicht eingereicht werden.");
    } finally {
      setBusy(null);
    }
  }

  function restart() {
    setResult(null);
    setFile(null);
    setPreview(null);
    setApplicantEmail("");
    setApplicantEmailValid(false);
    setApplicantEmailTouched(false);
    setApplicantEmailServerError(null);
    setApplicantName("");
    setApplicantOrganization("");
    setApplicantNote("");
    setError(null);
    if (fileRef.current) fileRef.current.value = "";
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <AppLayout>
      <main className="page-panel page-shell-wide public-xlsx-page">
        <section className="page-hero">
          <h2>Vereinfachte Besucherregelung</h2>
          <p>Mit der vereinfachten Besucherregelung können Sie mehrere Besucher gesammelt anmelden. Laden Sie die XLSX-Vorlage herunter, füllen Sie diese aus und senden Sie sie anschließend zur Prüfung ein.</p>
        </section>

        {result ? (
          <Card className="application-success" >
            <div aria-live="polite">
              <span className="application-success-icon" aria-hidden="true">✓</span>
              <h3>Antrag erfolgreich eingereicht</h3>
              <p><strong>Referenz: {result.reference}</strong></p>
              <p>{result.entryCount} {result.entryCount === 1 ? "Besucher wurde" : "Besucher wurden"} zur Prüfung eingereicht.</p>
              <Alert type="success">
                {result.emailVerificationRequired
                  ? "Bitte bestätigen Sie jetzt Ihre E-Mail-Adresse. Wir haben Ihnen eine Nachricht mit einem Bestätigungslink gesendet."
                  : "Ihr Antrag wurde an KSKdt zur Prüfung weitergeleitet."}
              </Alert>
              <Button type="button" onClick={restart}>Neue Anmeldung starten</Button>
            </div>
          </Card>
        ) : (
          <>
            <ol className="application-steps" aria-label="Schritte der vereinfachten Besucherregelung">
              {steps.map((label, index) => {
                const number = index + 1;
                const state = number < currentStep ? "completed" : number === currentStep ? "current" : "upcoming";
                return (
                  <li key={label} className={`application-step application-step-${state}`} aria-current={state === "current" ? "step" : undefined}>
                    <span className="application-step-marker" aria-hidden="true">{state === "completed" ? "✓" : number}</span>
                    <span><strong>{label}</strong><small>{state === "completed" ? "Erledigt" : state === "current" ? "Aktueller Schritt" : "Noch nicht begonnen"}</small></span>
                  </li>
                );
              })}
            </ol>

            {error ? <div ref={errorRef} tabIndex={-1}><Alert type="error"><span role="alert">{error}</span></Alert></div> : null}

            <div className="application-start-grid">
              <Card>
                <h3>XLSX-Vorlage herunterladen</h3>
                <p>Laden Sie zuerst die aktuelle Vorlage herunter und tragen Sie dort die Besucher ein.</p>
                <p>Mindestens Wache und Besuchszeitraum müssen angegeben werden. Weitere Personen- und Kontaktdaten können ergänzt werden.</p>
                <a className="button-link" href="/api/public/simplified-applications/template.xlsx" download onClick={() => setTemplateDownloaded(true)}>XLSX-Vorlage herunterladen</a>
                {templateDownloaded ? <p className="application-inline-status" aria-live="polite"><span aria-hidden="true">✓</span> Download wurde gestartet.</p> : null}
              </Card>

              <Card>
                <h3>Ausgefüllte XLSX-Datei hochladen</h3>
                <div className={`application-dropzone${file ? " has-file" : ""}`} onDragOver={(event) => event.preventDefault()} onDrop={handleDrop}>
                  <input
                    ref={fileRef}
                    id="public-xlsx-file"
                    className="visually-hidden"
                    type="file"
                    accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                    onChange={(event) => selectFile(event.target.files?.[0] ?? null)}
                  />
                  <label className="button-link" htmlFor="public-xlsx-file">{file ? "Andere Datei auswählen" : "XLSX-Datei auswählen"}</label>
                  <p>{file ? "Ausgewählte Datei" : "XLSX-Datei hier ablegen oder auswählen"}</p>
                  {file ? <div className="selected-file" aria-live="polite"><strong>{file.name}</strong><span>{formatFileSize(file.size)}</span><span className="application-inline-status"><span aria-hidden="true">✓</span> Bereit zur Prüfung</span></div> : null}
                  {file ? <Button className="secondary-button" type="button" onClick={() => { selectFile(null); if (fileRef.current) fileRef.current.value = ""; }} disabled={Boolean(busy)}>Entfernen</Button> : null}
                </div>
                <aside className="application-requirements" aria-labelledby="file-requirements-title">
                  <h4 id="file-requirements-title">Dateianforderungen</h4>
                  <ul>
                    <li>XLSX</li><li>maximal {Math.round(limits.maxBytes / 1024 / 1024)} MB</li><li>maximal {limits.maxRows} Besucher</li><li>maximal {limits.maxSheets} Tabellenblätter</li><li>keine Makros</li><li>keine Formeln</li>
                  </ul>
                </aside>
                <Button type="button" onClick={() => void inspect()} disabled={!bootstrap || !file || Boolean(busy)}>{busy === "preview" ? "Datei wird geprüft …" : "Datei prüfen und Vorschau anzeigen"}</Button>
              </Card>
            </div>

            {preview ? (
              <Card>
                <div ref={previewRef} tabIndex={-1} className="section-header application-preview-heading">
                  <div>
                    <h3>Besucherdaten prüfen</h3>
                    <p><strong>{preview.rows.length} {preview.rows.length === 1 ? "Besucher erkannt" : "Besucher erkannt"}</strong></p>
                  </div>
                  <div className="application-preview-summary" aria-label="Prüfergebnis">
                    <span className="preview-count-ok"><strong>{summary?.validRows}</strong> ohne Fehler</span>
                    <span className="preview-count-warning"><strong>{summary?.warningRows}</strong> mit Hinweisen</span>
                    <span className="preview-count-error"><strong>{summary?.errorRows}</strong> mit Fehlern</span>
                  </div>
                </div>
                {!preview.valid ? <Alert type="error">Der Antrag kann noch nicht abgesendet werden. Bitte korrigieren Sie die markierten Zeilen in der XLSX-Datei und laden Sie sie erneut hoch.</Alert> : null}
                <DataTable>
                  <thead><tr><th>Excel-Zeile</th><th>Name</th><th>Firma</th><th>Zeitraum</th><th>Wache</th><th>Ansprechpartner</th><th>Prüfstatus</th></tr></thead>
                  <tbody>{preview.rows.map((row) => {
                    const state = row.errors.length ? "Fehler" : row.warnings.length ? "Hinweis" : "OK";
                    return <tr key={row.rowNumber}><td>{row.rowNumber}</td><td>{[row.firstName, row.lastName].filter(Boolean).join(" ") || "–"}</td><td>{row.company || "–"}</td><td>{displayPeriod(row.validFrom, row.validUntil)}</td><td>{row.gateName || "–"}</td><td>{row.hostName || "–"}<br/><small>{row.hostDepartment || "–"}</small></td><td><span className={`preview-status preview-status-${state.toLowerCase()}`}><span aria-hidden="true">{state === "OK" ? "✓" : state === "Hinweis" ? "!" : "×"}</span> {state}</span>{row.errors.map((message) => <div className="field-error" key={message}>{message}</div>)}{row.warnings.map((message) => <div className="warning-text" key={message}>{message}</div>)}{row.licensePlate ? <details><summary>Weitere Angaben</summary><p>Kennzeichen: {row.licensePlate}</p></details> : null}</td></tr>;
                  })}</tbody>
                </DataTable>
              </Card>
            ) : null}

            {preview?.valid ? (
              <form onSubmit={(event) => void submit(event)}>
                <Card>
                  <h3>Ihre Kontaktdaten</h3>
                  <p>An diese Adresse senden wir Ihnen die Eingangs- und Entscheidungsbestätigung.</p>
                  <div className="form-grid application-contact-grid">
                    <FormField label="E-Mail-Adresse" required fieldId="applicant-email" error={applicantEmailError}>
                      <input
                        ref={applicantEmailRef}
                        name="applicantEmail"
                        type="email"
                        inputMode="email"
                        autoComplete="email"
                        required
                        maxLength={255}
                        value={applicantEmail}
                        onBlur={() => setApplicantEmailTouched(true)}
                        onChange={(event) => {
                          setApplicantEmail(event.target.value);
                          setApplicantEmailValid(event.currentTarget.validity.valid);
                          setApplicantEmailTouched(Boolean(event.target.value));
                          setApplicantEmailServerError(null);
                        }}
                      />
                    </FormField>
                    <FormField label="Name (optional)"><input name="applicantName" autoComplete="name" maxLength={255} value={applicantName} onChange={(event) => setApplicantName(event.target.value)} /></FormField>
                    <FormField label="Organisation / Abteilung (optional)"><input name="applicantOrganization" maxLength={255} value={applicantOrganization} onChange={(event) => setApplicantOrganization(event.target.value)} /></FormField>
                    <FormField label="Bemerkung (optional)"><textarea name="applicantNote" maxLength={2000} rows={4} value={applicantNote} onChange={(event) => setApplicantNote(event.target.value)} /></FormField>
                  </div>
                  {bootstrap?.requireEmailVerification ? <Alert type="info">Nach dem Absenden müssen Sie Ihre E-Mail-Adresse bestätigen. Sie erhalten dazu eine E-Mail mit einem Bestätigungslink.</Alert> : null}
                </Card>
                <Card className="application-submit-card">
                  <h3>Antrag absenden</h3>
                  <dl className="application-submit-summary">
                    <div><dt>Besucher</dt><dd>{preview.rows.length}</dd></div>
                    <div><dt>Besuchszeitraum</dt><dd>{summary?.period}</dd></div>
                    <div><dt>Antragsteller-E-Mail</dt><dd className="break-anywhere">{applicantEmail || "–"}</dd></div>
                    <div><dt>E-Mail-Bestätigung erforderlich</dt><dd>{bootstrap?.requireEmailVerification ? "Ja" : "Nein"}</dd></div>
                  </dl>
                  <Button type="submit" disabled={Boolean(busy) || !applicantEmailValid}>{busy === "submit" ? "Antrag wird eingereicht …" : "Antrag der vereinfachten Besucherregelung absenden"}</Button>
                </Card>
              </form>
            ) : null}
          </>
        )}
      </main>
    </AppLayout>
  );
}
