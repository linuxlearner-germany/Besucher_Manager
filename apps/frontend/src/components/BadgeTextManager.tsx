import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Card, FormField } from "./ui";
import { BRANDING, type AdminBadgeText, type ApiError, fetchJson, formatTextType } from "../app/core";

type BadgeTextManagerProps = {
  heading?: string;
  description?: string;
};

type BadgeTextDraft = {
  sectionType: string;
  customHeading: string;
  content: string;
  isActive: boolean;
};

type StatusFilter = "all" | "active" | "inactive";

const sectionOptions = [
  { value: "security_notice", label: "Sicherheitshinweise" },
  { value: "photo_ban", label: "Fotografierverbot" },
  { value: "signature_notice", label: "Rückgabe und Unterschrift" },
  { value: "visitor_notice", label: "Hinweis für Besucher" },
  { value: "footer", label: "Footer" },
  { value: "custom", label: "Benutzerdefinierter Bereich" }
];

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function createDraft(text?: AdminBadgeText): BadgeTextDraft {
  return {
    sectionType: text?.sectionType ?? "security_notice",
    customHeading: text?.customHeading ?? "",
    content: text?.content ?? "",
    isActive: text?.isActive ?? true
  };
}

function getHeading(text: Pick<AdminBadgeText, "heading"> | BadgeTextDraft): string {
  if ("heading" in text) {
    return text.heading;
  }

  if (text.sectionType === "custom") {
    return text.customHeading.trim();
  }

  return formatTextType(text.sectionType);
}

function isDirty(original: AdminBadgeText, draft: BadgeTextDraft): boolean {
  return (
    original.sectionType !== draft.sectionType ||
    (original.customHeading ?? "") !== draft.customHeading ||
    original.content !== draft.content ||
    original.isActive !== draft.isActive
  );
}

function summarizeContent(content: string): string {
  const normalized = content.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return "Kein Inhalt";
  }
  return normalized.length > 140 ? `${normalized.slice(0, 137)}...` : normalized;
}

export function BadgeTextManager({
  heading = "Hinweistexte"
}: BadgeTextManagerProps) {
  const [texts, setTexts] = useState<AdminBadgeText[]>([]);
  const [editableTexts, setEditableTexts] = useState<Record<string, BadgeTextDraft>>({});
  const [newText, setNewText] = useState<BadgeTextDraft>(createDraft());
  const [selectedTextId, setSelectedTextId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [previewText, setPreviewText] = useState<BadgeTextDraft | AdminBadgeText | null>(null);
  const [savePendingId, setSavePendingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadTexts = useCallback(async () => {
    setError(null);
    try {
      const payload = await fetchJson<{ texts: AdminBadgeText[] }>("/api/texts", { method: "GET", headers: {} });
      setTexts(payload.texts);
      setEditableTexts(Object.fromEntries(payload.texts.map((text) => [text.id, createDraft(text)])));
      setSelectedTextId((current) => {
        if (current && payload.texts.some((text) => text.id === current)) {
          return current;
        }
        return payload.texts[0]?.id ?? null;
      });
    } catch (apiError) {
      const payload = apiError as ApiError;
      setError(payload.message || "Hinweistexte konnten nicht geladen werden.");
    }
  }, []);

  useEffect(() => {
    void loadTexts();
  }, [loadTexts]);

  const filteredTexts = useMemo(() => {
    const search = searchTerm.trim().toLocaleLowerCase("de");
    return texts
      .filter((text) => {
        if (typeFilter !== "all" && text.sectionType !== typeFilter) {
          return false;
        }
        if (statusFilter === "active" && !text.isActive) {
          return false;
        }
        if (statusFilter === "inactive" && text.isActive) {
          return false;
        }
        if (!search) {
          return true;
        }
        return [text.heading, text.sectionLabel, text.content]
          .join(" ")
          .toLocaleLowerCase("de")
          .includes(search);
      })
      .sort((left, right) => left.sortOrder - right.sortOrder || left.heading.localeCompare(right.heading, "de"));
  }, [searchTerm, statusFilter, texts, typeFilter]);

  const selectedText = useMemo(
    () => texts.find((text) => text.id === selectedTextId) ?? null,
    [selectedTextId, texts]
  );

  const selectedDraft = selectedText ? (editableTexts[selectedText.id] ?? createDraft(selectedText)) : null;
  const activeCount = texts.filter((text) => text.isActive).length;
  const inactiveCount = texts.length - activeCount;

  function openPrintPreview(text: BadgeTextDraft | AdminBadgeText) {
    const popup = window.open("", "_blank", "noopener,noreferrer,width=860,height=900");
    if (!popup) {
      setError("Die Druckvorschau wurde vom Browser blockiert.");
      return;
    }

    const displayHeading = getHeading(text);
    const displaySection = "sectionLabel" in text ? text.sectionLabel : (text.sectionType === "custom" ? "Benutzerdefiniert" : formatTextType(text.sectionType));
    popup.document.write(`<!DOCTYPE html>
<html lang="de">
  <head>
    <meta charset="utf-8" />
    <title>Druckvorschau ${escapeHtml(displayHeading || "Hinweistext")}</title>
    <style>
      body { font-family: Arial, sans-serif; margin: 0; padding: 28px; color: #10233a; }
      .sheet { max-width: 760px; margin: 0 auto; border: 1px solid #c8d4e3; border-radius: 12px; padding: 28px; }
      .header { display: flex; align-items: flex-start; justify-content: space-between; gap: 24px; margin-bottom: 24px; }
      .header img { width: 150px; height: auto; object-fit: contain; }
      .eyebrow { margin: 0 0 6px; font-size: 12px; text-transform: uppercase; color: #51657e; }
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
          <p class="eyebrow">Besucherschein</p>
          <h1>${escapeHtml(displayHeading || "Hinweistext")}</h1>
        </div>
        <img src="${escapeHtml(BRANDING.logo)}" alt="WIWeB" />
      </div>
      <div class="meta">
        <div>
          <span class="label">Bereich auf dem Besucherschein</span>
          <span class="value">${escapeHtml(displaySection)}</span>
        </div>
        <div>
          <span class="label">Status</span>
          <span class="value">${text.isActive ? "Aktiv" : "Inaktiv"}</span>
        </div>
      </div>
      <div class="content">${escapeHtml(text.content || "-")}</div>
    </div>
  </body>
</html>`);
    popup.document.close();
  }

  async function createText(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      await fetchJson("/api/texts", {
        method: "POST",
        body: JSON.stringify(newText)
      });
      setNewText(createDraft());
      setMessage("Hinweistext angelegt.");
      setError(null);
      await loadTexts();
    } catch (apiError) {
      const payload = apiError as ApiError;
      setError(payload.message || "Der Hinweistext konnte nicht angelegt werden.");
    }
  }

  async function saveText(text: AdminBadgeText, draft: BadgeTextDraft) {
    setSavePendingId(text.id);
    try {
      await fetchJson(`/api/texts/${text.id}`, {
        method: "PUT",
        body: JSON.stringify(draft)
      });
      setMessage("Hinweistext gespeichert.");
      setError(null);
      await loadTexts();
    } catch (apiError) {
      const payload = apiError as ApiError;
      setError(payload.message || "Der Hinweistext konnte nicht gespeichert werden.");
    } finally {
      setSavePendingId(null);
    }
  }

  async function toggleTextActive(text: AdminBadgeText) {
    try {
      await fetchJson(`/api/texts/${text.id}/${text.isActive ? "deactivate" : "reactivate"}`, {
        method: "POST",
        body: JSON.stringify({})
      });
      setMessage(text.isActive ? "Hinweistext deaktiviert." : "Hinweistext aktiviert.");
      setError(null);
      await loadTexts();
    } catch (apiError) {
      const payload = apiError as ApiError;
      setError(payload.message || "Der Status konnte nicht geändert werden.");
    }
  }

  async function moveText(text: AdminBadgeText, direction: "up" | "down") {
    try {
      await fetchJson(`/api/texts/${text.id}/move-${direction}`, {
        method: "POST",
        body: JSON.stringify({})
      });
      setMessage(direction === "up" ? "Hinweistext nach oben verschoben." : "Hinweistext nach unten verschoben.");
      setError(null);
      await loadTexts();
    } catch (apiError) {
      const payload = apiError as ApiError;
      setError(payload.message || "Die Reihenfolge konnte nicht geändert werden.");
    }
  }

  function updateSelectedText<K extends keyof BadgeTextDraft>(key: K, value: BadgeTextDraft[K]) {
    if (!selectedText) {
      return;
    }

    setEditableTexts((current) => ({
      ...current,
      [selectedText.id]: {
        ...(current[selectedText.id] ?? createDraft(selectedText)),
        [key]: value
      }
    }));
  }

  function duplicateIntoNewText() {
    if (!selectedText || !selectedDraft) {
      return;
    }

    setNewText({
      sectionType: selectedDraft.sectionType,
      customHeading: selectedDraft.sectionType === "custom"
        ? `${selectedDraft.customHeading.trim()} – Kopie`
        : "",
      content: selectedDraft.content,
      isActive: selectedDraft.isActive
    });
    setMessage("Hinweistext als Vorlage übernommen.");
    setError(null);
  }

  function resetSelectedDraft() {
    if (!selectedText) {
      return;
    }
    setEditableTexts((current) => ({
      ...current,
      [selectedText.id]: createDraft(selectedText)
    }));
  }

  return (
    <div className="badge-text-manager">
      <div className="section-header">
        <div>
          <h3>{heading}</h3>
        </div>
      </div>

      {message ? <Alert type="success">{message}</Alert> : null}
      {error ? <Alert type="error">{error}</Alert> : null}

      <section className="panel text-manager-toolbar">
        <div className="text-manager-toolbar-grid">
          <FormField label="Suche">
            <input
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Überschrift, Bereich oder Inhalt"
            />
          </FormField>
          <FormField label="Status">
            <div className="text-filter-row">
              <button type="button" className={statusFilter === "all" ? "secondary-button active-chip" : "secondary-button"} onClick={() => setStatusFilter("all")}>Alle ({texts.length})</button>
              <button type="button" className={statusFilter === "active" ? "secondary-button active-chip" : "secondary-button"} onClick={() => setStatusFilter("active")}>Aktiv ({activeCount})</button>
              <button type="button" className={statusFilter === "inactive" ? "secondary-button active-chip" : "secondary-button"} onClick={() => setStatusFilter("inactive")}>Inaktiv ({inactiveCount})</button>
            </div>
          </FormField>
        </div>
        <div className="text-type-chip-row">
          <button type="button" className={typeFilter === "all" ? "secondary-button active-chip" : "secondary-button"} onClick={() => setTypeFilter("all")}>Alle Bereiche</button>
          {sectionOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              className={typeFilter === option.value ? "secondary-button active-chip" : "secondary-button"}
              onClick={() => setTypeFilter(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </section>

      <div className="text-manager-layout">
        <div className="text-manager-sidebar">
          <Card className="text-editor-card">
            <div className="text-section-header">
              <div>
                <h4>Neuen Bereich anlegen</h4>
              </div>
            </div>
            <form className="form-grid" onSubmit={createText}>
              <FormField label="Bereich auf dem Besucherschein" required>
                <select value={newText.sectionType} onChange={(event) => setNewText((current) => ({ ...current, sectionType: event.target.value }))}>
                  {sectionOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </FormField>

              {newText.sectionType === "custom" ? (
                <FormField label="Eigene Überschrift" required>
                  <input value={newText.customHeading} onChange={(event) => setNewText((current) => ({ ...current, customHeading: event.target.value }))} />
                </FormField>
              ) : null}

              <label className="checkbox-row text-active-toggle">
                <input type="checkbox" checked={newText.isActive} onChange={(event) => setNewText((current) => ({ ...current, isActive: event.target.checked }))} />
                Aktiv
              </label>

              <FormField label="Inhalt" required>
                <textarea className="text-editor-area text-editor-area-compact" rows={6} value={newText.content} onChange={(event) => setNewText((current) => ({ ...current, content: event.target.value }))} />
              </FormField>

              <div className="row-actions text-editor-actions">
                <button type="submit">Speichern</button>
                <button type="button" className="secondary-button" onClick={() => setPreviewText(newText)} disabled={!newText.content.trim()}>
                  Vorschau
                </button>
                <button type="button" className="secondary-button" onClick={() => openPrintPreview(newText)} disabled={!newText.content.trim()}>
                  Drucken
                </button>
                <button type="button" className="secondary-button" onClick={() => setNewText(createDraft())}>
                  Leeren
                </button>
              </div>
            </form>
          </Card>

          <Card className="text-list-card">
            <div className="text-section-header">
              <div>
                <h4>Vorhandene Bereiche</h4>
              </div>
            </div>
            <div className="text-record-list">
              {filteredTexts.length ? filteredTexts.map((text) => {
                const draft = editableTexts[text.id] ?? createDraft(text);
                const dirty = isDirty(text, draft);

                return (
                  <button
                    key={text.id}
                    type="button"
                    className={selectedTextId === text.id ? "text-record-button active-record" : "text-record-button"}
                    onClick={() => setSelectedTextId(text.id)}
                  >
                    <div className="text-record-header">
                      <strong>{text.heading}</strong>
                      <span className="field-config-badge">{text.isActive ? "Aktiv" : "Inaktiv"}</span>
                    </div>
                    <div className="text-record-meta">
                      <span className="field-config-badge">{text.sectionLabel}</span>
                      {dirty ? <span className="field-config-badge">Ungespeichert</span> : null}
                    </div>
                    <p>{summarizeContent(draft.content)}</p>
                  </button>
                );
              }) : (
                <div className="text-empty-state">
                  Keine Hinweistexte für die aktuelle Auswahl gefunden.
                </div>
              )}
            </div>
          </Card>
        </div>

        <Card className="text-detail-card">
          {selectedText && selectedDraft ? (
            <>
              <div className="text-section-header">
                <div>
                  <h4>{selectedText.heading}</h4>
                </div>
                <div className="text-detail-status">
                  <span className="field-config-badge">{selectedText.sectionLabel}</span>
                  <span className="field-config-badge">{selectedDraft.isActive ? "Aktiv" : "Inaktiv"}</span>
                  {isDirty(selectedText, selectedDraft) ? <span className="field-config-badge">Ungespeichert</span> : null}
                </div>
              </div>

              <div className="form-grid">
                <FormField label="Bereich auf dem Besucherschein" required>
                  <select value={selectedDraft.sectionType} onChange={(event) => updateSelectedText("sectionType", event.target.value)}>
                    {sectionOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                </FormField>

                {selectedDraft.sectionType === "custom" ? (
                  <FormField label="Eigene Überschrift" required>
                    <input value={selectedDraft.customHeading} onChange={(event) => updateSelectedText("customHeading", event.target.value)} />
                  </FormField>
                ) : null}

                <label className="checkbox-row text-active-toggle">
                  <input type="checkbox" checked={selectedDraft.isActive} onChange={(event) => updateSelectedText("isActive", event.target.checked)} />
                  Aktiv
                </label>

                <FormField label="Inhalt" required>
                  <textarea
                    className="text-editor-area"
                    rows={8}
                    value={selectedDraft.content}
                    onChange={(event) => updateSelectedText("content", event.target.value)}
                  />
                </FormField>

                <div className="row-actions text-editor-actions">
                  <button type="button" onClick={() => void saveText(selectedText, selectedDraft)} disabled={savePendingId === selectedText.id}>
                    {savePendingId === selectedText.id ? "Speichert..." : "Speichern"}
                  </button>
                  <button type="button" className="secondary-button" onClick={() => setPreviewText({ ...selectedText, ...selectedDraft, heading: getHeading(selectedDraft), sectionLabel: selectedDraft.sectionType === "custom" ? "Benutzerdefiniert" : formatTextType(selectedDraft.sectionType) })}>
                    Vorschau
                  </button>
                  <button type="button" className="secondary-button" onClick={() => openPrintPreview({ ...selectedText, ...selectedDraft, heading: getHeading(selectedDraft), sectionLabel: selectedDraft.sectionType === "custom" ? "Benutzerdefiniert" : formatTextType(selectedDraft.sectionType) })}>
                    Drucken
                  </button>
                  <button type="button" className="secondary-button" onClick={duplicateIntoNewText}>
                    Duplizieren
                  </button>
                  <button type="button" className="secondary-button" onClick={() => void moveText(selectedText, "up")}>
                    Nach oben
                  </button>
                  <button type="button" className="secondary-button" onClick={() => void moveText(selectedText, "down")}>
                    Nach unten
                  </button>
                  <button type="button" className="secondary-button" onClick={resetSelectedDraft} disabled={!isDirty(selectedText, selectedDraft)}>
                    Zurücksetzen
                  </button>
                  <button type="button" className="danger-button" onClick={() => void toggleTextActive(selectedText)}>
                    {selectedText.isActive ? "Deaktivieren" : "Aktivieren"}
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="text-empty-state text-empty-state-large">
              Links einen Hinweistext auswählen, um ihn zu bearbeiten.
            </div>
          )}
        </Card>
      </div>

      {previewText ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true" onClick={(event) => {
          if (event.target === event.currentTarget) {
            setPreviewText(null);
          }
        }}>
          <div className="modal-card panel text-preview-modal">
            <div className="modal-header">
              <h4>Vorschau</h4>
              <button type="button" className="secondary-button modal-close-button" onClick={() => setPreviewText(null)}>
                Schließen
              </button>
            </div>
            <div className="text-preview-sheet">
              <div className="text-preview-header">
                <div>
                  <p className="eyebrow">Besucherschein</p>
                  <h3>{getHeading(previewText) || "Ohne Überschrift"}</h3>
                </div>
                <img className="badge-print-logo" src={BRANDING.logo} alt="WIWeB" />
              </div>
              <div className="text-preview-content">
                {previewText.content || "Kein Inhalt vorhanden."}
              </div>
            </div>
            <div className="row-actions action-bar">
              <button type="button" onClick={() => openPrintPreview(previewText)}>Drucken</button>
              <button type="button" className="secondary-button" onClick={() => setPreviewText(null)}>Schließen</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
