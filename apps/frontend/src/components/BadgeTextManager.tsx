import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Card, FormField } from "./ui";
import { BRANDING, type AdminBadgeText, type ApiError, fetchJson, formatTextType } from "../app/core";

type BadgeTextManagerProps = {
  heading?: string;
  description?: string;
};

const defaultTextTypes = ["security_notice", "photo_ban", "signature_notice", "footer"];

type BadgeTextDraft = {
  name: string;
  textType: string;
  content: string;
  isActive: boolean;
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function getInitialDraft(): BadgeTextDraft {
  return {
    name: "",
    textType: "security_notice",
    content: "",
    isActive: true
  };
}

export function BadgeTextManager({
  heading = "Hinweistexte",
  description = ""
}: BadgeTextManagerProps) {
  const [texts, setTexts] = useState<AdminBadgeText[]>([]);
  const [editableTexts, setEditableTexts] = useState<Record<string, AdminBadgeText>>({});
  const [newText, setNewText] = useState<BadgeTextDraft>(getInitialDraft());
  const [previewText, setPreviewText] = useState<BadgeTextDraft | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const knownTypes = useMemo(
    () => Array.from(new Set([
      ...defaultTextTypes,
      ...texts.map((text) => text.textType),
      newText.textType,
      ...(previewText ? [previewText.textType] : [])
    ].filter((entry) => entry.trim()))).sort((left, right) => left.localeCompare(right, "de")),
    [newText.textType, previewText, texts]
  );

  const loadTexts = useCallback(async () => {
    setError(null);
    try {
      const payload = await fetchJson<{ texts: AdminBadgeText[] }>("/api/admin/badge-texts", { method: "GET", headers: {} });
      setTexts(payload.texts);
      setEditableTexts(Object.fromEntries(payload.texts.map((text) => [text.id, { ...text }])));
    } catch (apiError) {
      const payload = apiError as ApiError;
      setError(payload.message || "Texte konnten nicht geladen werden.");
    }
  }, []);

  useEffect(() => {
    void loadTexts();
  }, [loadTexts]);

  function openPrintPreview(text: BadgeTextDraft) {
    const popup = window.open("", "_blank", "noopener,noreferrer,width=860,height=900");
    if (!popup) {
      setError("Die Druckvorschau wurde vom Browser blockiert.");
      return;
    }

    popup.document.write(`<!DOCTYPE html>
<html lang="de">
  <head>
    <meta charset="utf-8" />
    <title>Druckvorschau ${escapeHtml(text.name || "Hinweistext")}</title>
    <style>
      body { font-family: Arial, sans-serif; margin: 0; padding: 28px; color: #10233a; }
      .sheet { max-width: 760px; margin: 0 auto; border: 1px solid #c8d4e3; border-radius: 12px; padding: 28px; }
      .header { display: flex; align-items: flex-start; justify-content: space-between; gap: 24px; margin-bottom: 24px; }
      .header img { width: 150px; height: auto; object-fit: contain; }
      .eyebrow { margin: 0 0 6px; font-size: 12px; letter-spacing: 0; text-transform: uppercase; color: #51657e; }
      h1 { margin: 0 0 12px; font-size: 28px; }
      .meta { display: grid; gap: 8px; margin-bottom: 18px; }
      .meta div { display: grid; gap: 4px; }
      .label { font-size: 12px; color: #51657e; text-transform: uppercase; }
      .value { font-size: 16px; font-weight: 600; }
      .content { white-space: pre-wrap; line-height: 1.5; font-size: 15px; border-top: 1px solid #d7e1ec; padding-top: 18px; }
      @media print { body { padding: 0; } .sheet { border: 0; border-radius: 0; max-width: none; } }
    </style>
  </head>
  <body>
    <div class="sheet">
      <div class="header">
        <div>
          <p class="eyebrow">Druckvorschau</p>
          <h1>${escapeHtml(text.name || "Hinweistext")}</h1>
        </div>
        <img src="${escapeHtml(BRANDING.logo)}" alt="WIWeB" />
      </div>
      <div class="meta">
        <div>
          <span class="label">Typ</span>
          <span class="value">${escapeHtml(formatTextType(text.textType))}</span>
        </div>
        <div>
          <span class="label">Status</span>
          <span class="value">${text.isActive ? "Aktiv" : "Inaktiv"}</span>
        </div>
      </div>
      <div class="content">${escapeHtml(text.content || "-")}</div>
    </div>
    <script>window.onload = function(){ window.focus(); };</script>
  </body>
</html>`);
    popup.document.close();
  }

  async function createText(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      await fetchJson("/api/admin/badge-texts", {
        method: "POST",
        body: JSON.stringify(newText)
      });
      setNewText(getInitialDraft());
      setMessage("Hinweistext angelegt.");
      setError(null);
      await loadTexts();
    } catch (apiError) {
      const payload = apiError as ApiError;
      setError(payload.message || "Hinweistext konnte nicht angelegt werden.");
    }
  }

  async function saveText(text: AdminBadgeText) {
    try {
      await fetchJson(`/api/admin/badge-texts/${text.id}`, {
        method: "PUT",
        body: JSON.stringify(text)
      });
      setMessage("Hinweistext gespeichert.");
      setError(null);
      await loadTexts();
    } catch (apiError) {
      const payload = apiError as ApiError;
      setError(payload.message || "Hinweistext konnte nicht gespeichert werden.");
    }
  }

  async function toggleTextActive(textId: string, isActive: boolean) {
    try {
      await fetchJson(`/api/admin/badge-texts/${textId}/${isActive ? "deactivate" : "reactivate"}`, {
        method: "POST",
        body: JSON.stringify({})
      });
      setMessage(isActive ? "Hinweistext deaktiviert." : "Hinweistext reaktiviert.");
      setError(null);
      await loadTexts();
    } catch (apiError) {
      const payload = apiError as ApiError;
      setError(payload.message || "Hinweistext konnte nicht aktualisiert werden.");
    }
  }

  return (
    <div className="badge-text-manager">
      <div className="section-header">
        <div>
          <h3>{heading}</h3>
          {description ? <p className="section-copy">{description}</p> : null}
        </div>
      </div>

      {message ? <Alert type="success">{message}</Alert> : null}
      {error ? <Alert type="error">{error}</Alert> : null}

      <Card className="text-editor-card">
        <h4>Neuer Text</h4>
        <form className="form-grid two-columns" onSubmit={createText}>
          <FormField label="Name" required>
            <input value={newText.name} onChange={(event) => setNewText((current) => ({ ...current, name: event.target.value }))} />
          </FormField>
          <FormField label="Typ" required>
            <input
              list="badge-text-type-options"
              value={newText.textType}
              onChange={(event) => setNewText((current) => ({ ...current, textType: event.target.value }))}
              placeholder="z. B. sicherheit"
            />
          </FormField>
          <div className="text-type-chip-row">
            {knownTypes.map((type) => (
              <button
                key={type}
                type="button"
                className={newText.textType === type ? "secondary-button active-chip" : "secondary-button"}
                onClick={() => setNewText((current) => ({ ...current, textType: type }))}
              >
                {formatTextType(type)}
              </button>
            ))}
          </div>
          <label className="checkbox-row text-active-toggle">
            <input type="checkbox" checked={newText.isActive} onChange={(event) => setNewText((current) => ({ ...current, isActive: event.target.checked }))} />
            Aktiv
          </label>
          <FormField label="Inhalt" required>
            <textarea className="text-editor-area" rows={8} value={newText.content} onChange={(event) => setNewText((current) => ({ ...current, content: event.target.value }))} />
          </FormField>
          <div className="row-actions text-editor-actions">
            <button type="submit">Text anlegen</button>
            <button type="button" className="secondary-button" onClick={() => setPreviewText(newText)} disabled={!newText.name.trim() && !newText.content.trim()}>
              Vorschau
            </button>
            <button type="button" className="secondary-button" onClick={() => openPrintPreview(newText)} disabled={!newText.name.trim() && !newText.content.trim()}>
              Drucken
            </button>
          </div>
        </form>
      </Card>

      <datalist id="badge-text-type-options">
        {knownTypes.map((type) => <option key={type} value={type} />)}
      </datalist>

      <div className="badge-text-type-list">
        {knownTypes.map((type) => <span key={type} className="field-config-badge">{formatTextType(type)}</span>)}
      </div>

      <div className="text-entry-stack">
        {texts.map((text) => (
          <Card key={text.id} className="text-entry-card">
            <div className="text-entry-header">
              <h4>{text.name}</h4>
              <span className="field-config-badge">{editableTexts[text.id]?.isActive ?? text.isActive ? "Aktiv" : "Inaktiv"}</span>
            </div>
            <div className="form-grid two-columns">
              <FormField label="Name">
                <input
                  value={editableTexts[text.id]?.name || ""}
                  onChange={(event) => setEditableTexts((current) => ({ ...current, [text.id]: { ...(current[text.id] || text), name: event.target.value } }))}
                />
              </FormField>
              <FormField label="Typ">
                <input
                  list="badge-text-type-options"
                  value={editableTexts[text.id]?.textType || text.textType}
                  onChange={(event) => setEditableTexts((current) => ({ ...current, [text.id]: { ...(current[text.id] || text), textType: event.target.value } }))}
                />
              </FormField>
              <label className="checkbox-row text-active-toggle">
                <input
                  type="checkbox"
                  checked={editableTexts[text.id]?.isActive ?? text.isActive}
                  onChange={(event) => setEditableTexts((current) => ({ ...current, [text.id]: { ...(current[text.id] || text), isActive: event.target.checked } }))}
                />
                Aktiv
              </label>
              <div />
              <FormField label="Inhalt">
                <textarea
                  className="text-editor-area"
                  rows={7}
                  value={editableTexts[text.id]?.content || ""}
                  onChange={(event) => setEditableTexts((current) => ({ ...current, [text.id]: { ...(current[text.id] || text), content: event.target.value } }))}
                />
              </FormField>
              <div className="row-actions text-editor-actions">
                <button type="button" onClick={() => void saveText(editableTexts[text.id] || text)}>Speichern</button>
                <button type="button" className="secondary-button" onClick={() => setPreviewText(editableTexts[text.id] || text)}>
                  Vorschau
                </button>
                <button type="button" className="secondary-button" onClick={() => openPrintPreview(editableTexts[text.id] || text)}>
                  Drucken
                </button>
                <button className="danger-button" type="button" onClick={() => void toggleTextActive(text.id, text.isActive)}>
                  {text.isActive ? "Deaktivieren" : "Reaktivieren"}
                </button>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {previewText ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true" onClick={(event) => {
          if (event.target === event.currentTarget) {
            setPreviewText(null);
          }
        }}>
          <div className="modal-card panel text-preview-modal">
            <div className="modal-header">
              <h4>Druckvorschau</h4>
              <button type="button" className="secondary-button modal-close-button" onClick={() => setPreviewText(null)}>
                Schliessen
              </button>
            </div>
            <div className="text-preview-sheet">
              <div className="text-preview-header">
                <div>
                  <p className="eyebrow">Hinweistext</p>
                  <h3>{previewText.name || "Ohne Name"}</h3>
                  <p className="section-copy">{formatTextType(previewText.textType)}</p>
                </div>
                <img className="badge-print-logo" src={BRANDING.logo} alt="WIWeB" />
              </div>
              <div className="text-preview-content">
                {previewText.content || "Kein Inhalt vorhanden."}
              </div>
            </div>
            <div className="row-actions action-bar">
              <button type="button" onClick={() => openPrintPreview(previewText)}>Drucken</button>
              <button type="button" className="secondary-button" onClick={() => setPreviewText(null)}>Schliessen</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
