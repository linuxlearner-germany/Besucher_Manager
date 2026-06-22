import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Card, FormField } from "./ui";
import { BRANDING, type AdminBadgeText, type ApiError, fetchJson, formatTextType } from "../app/core";

type BadgeTextManagerProps = {
  heading?: string;
  description?: string;
};

type BadgeTextDraft = {
  name: string;
  textType: string;
  content: string;
  isActive: boolean;
};

type StatusFilter = "all" | "active" | "inactive";

const defaultTextTypes = ["security_notice", "photo_ban", "signature_notice", "footer"];

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
    name: text?.name ?? "",
    textType: text?.textType ?? "security_notice",
    content: text?.content ?? "",
    isActive: text?.isActive ?? true
  };
}

function isDirty(original: AdminBadgeText, draft: AdminBadgeText | BadgeTextDraft): boolean {
  return (
    original.name !== draft.name ||
    original.textType !== draft.textType ||
    original.content !== draft.content ||
    original.isActive !== draft.isActive
  );
}

function summarizeContent(content: string): string {
  const normalized = content.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return "Kein Inhalt";
  }
  return normalized.length > 120 ? `${normalized.slice(0, 117)}...` : normalized;
}

export function BadgeTextManager({
  heading = "Hinweistexte",
  description = ""
}: BadgeTextManagerProps) {
  const [texts, setTexts] = useState<AdminBadgeText[]>([]);
  const [editableTexts, setEditableTexts] = useState<Record<string, AdminBadgeText>>({});
  const [newText, setNewText] = useState<BadgeTextDraft>(createDraft());
  const [selectedTextId, setSelectedTextId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [previewText, setPreviewText] = useState<BadgeTextDraft | null>(null);
  const [savePendingId, setSavePendingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const knownTypes = useMemo(
    () => Array.from(new Set([
      ...defaultTextTypes,
      ...texts.map((text) => text.textType),
      newText.textType
    ].filter((entry) => entry.trim()))).sort((left, right) => left.localeCompare(right, "de")),
    [newText.textType, texts]
  );

  const loadTexts = useCallback(async () => {
    setError(null);
    try {
      const payload = await fetchJson<{ texts: AdminBadgeText[] }>("/api/admin/badge-texts", { method: "GET", headers: {} });
      setTexts(payload.texts);
      setEditableTexts(Object.fromEntries(payload.texts.map((text) => [text.id, { ...text }])));
      setSelectedTextId((current) => {
        if (current && payload.texts.some((text) => text.id === current)) {
          return current;
        }
        return payload.texts[0]?.id ?? null;
      });
    } catch (apiError) {
      const payload = apiError as ApiError;
      setError(payload.message || "Texte konnten nicht geladen werden.");
    }
  }, []);

  useEffect(() => {
    void loadTexts();
  }, [loadTexts]);

  const typeCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const text of texts) {
      counts.set(text.textType, (counts.get(text.textType) ?? 0) + 1);
    }
    return counts;
  }, [texts]);

  const filteredTexts = useMemo(() => {
    const search = searchTerm.trim().toLocaleLowerCase("de");

    return [...texts]
      .filter((text) => {
        if (typeFilter !== "all" && text.textType !== typeFilter) {
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
        return [text.name, text.textType, text.content]
          .join(" ")
          .toLocaleLowerCase("de")
          .includes(search);
      })
      .sort((left, right) => {
        if (left.isActive !== right.isActive) {
          return left.isActive ? -1 : 1;
        }
        return left.name.localeCompare(right.name, "de");
      });
  }, [searchTerm, statusFilter, texts, typeFilter]);

  const selectedText = useMemo(
    () => texts.find((text) => text.id === selectedTextId) ?? null,
    [selectedTextId, texts]
  );

  const selectedDraft = selectedText
    ? (editableTexts[selectedText.id] ?? selectedText)
    : null;

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
      setNewText(createDraft());
      setMessage("Text angelegt.");
      setError(null);
      await loadTexts();
    } catch (apiError) {
      const payload = apiError as ApiError;
      setError(payload.message || "Text konnte nicht angelegt werden.");
    }
  }

  async function saveText(text: AdminBadgeText) {
    setSavePendingId(text.id);
    try {
      await fetchJson(`/api/admin/badge-texts/${text.id}`, {
        method: "PUT",
        body: JSON.stringify(text)
      });
      setMessage("Text gespeichert.");
      setError(null);
      await loadTexts();
    } catch (apiError) {
      const payload = apiError as ApiError;
      setError(payload.message || "Text konnte nicht gespeichert werden.");
    } finally {
      setSavePendingId(null);
    }
  }

  async function toggleTextActive(text: AdminBadgeText) {
    try {
      await fetchJson(`/api/admin/badge-texts/${text.id}/${text.isActive ? "deactivate" : "reactivate"}`, {
        method: "POST",
        body: JSON.stringify({})
      });
      setMessage(text.isActive ? "Text deaktiviert." : "Text reaktiviert.");
      setError(null);
      await loadTexts();
    } catch (apiError) {
      const payload = apiError as ApiError;
      setError(payload.message || "Text konnte nicht aktualisiert werden.");
    }
  }

  function updateSelectedText<K extends keyof AdminBadgeText>(key: K, value: AdminBadgeText[K]) {
    if (!selectedText) {
      return;
    }
    setEditableTexts((current) => ({
      ...current,
      [selectedText.id]: {
        ...(current[selectedText.id] ?? selectedText),
        [key]: value
      }
    }));
  }

  function duplicateIntoNewText() {
    if (!selectedDraft) {
      return;
    }
    setNewText({
      name: selectedDraft.name ? `${selectedDraft.name} Kopie` : "",
      textType: selectedDraft.textType,
      content: selectedDraft.content,
      isActive: selectedDraft.isActive
    });
    setMessage("Text als Vorlage in den Bereich 'Neu anlegen' uebernommen.");
    setError(null);
  }

  function resetSelectedDraft() {
    if (!selectedText) {
      return;
    }
    setEditableTexts((current) => ({
      ...current,
      [selectedText.id]: { ...selectedText }
    }));
  }

  const activeCount = texts.filter((text) => text.isActive).length;
  const inactiveCount = texts.length - activeCount;

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

      <section className="panel text-manager-toolbar">
        <div className="text-manager-toolbar-grid">
          <FormField label="Suche">
            <input
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Name, Typ oder Inhalt"
            />
          </FormField>
          <FormField label="Status">
            <div className="text-filter-row">
              <button type="button" className={statusFilter === "all" ? "secondary-button active-chip" : "secondary-button"} onClick={() => setStatusFilter("all")}>
                Alle ({texts.length})
              </button>
              <button type="button" className={statusFilter === "active" ? "secondary-button active-chip" : "secondary-button"} onClick={() => setStatusFilter("active")}>
                Aktiv ({activeCount})
              </button>
              <button type="button" className={statusFilter === "inactive" ? "secondary-button active-chip" : "secondary-button"} onClick={() => setStatusFilter("inactive")}>
                Inaktiv ({inactiveCount})
              </button>
            </div>
          </FormField>
        </div>
        <div className="text-type-chip-row">
          <button type="button" className={typeFilter === "all" ? "secondary-button active-chip" : "secondary-button"} onClick={() => setTypeFilter("all")}>
            Alle Typen
          </button>
          {knownTypes.map((type) => (
            <button
              key={type}
              type="button"
              className={typeFilter === type ? "secondary-button active-chip" : "secondary-button"}
              onClick={() => setTypeFilter(type)}
            >
              {formatTextType(type)} ({typeCounts.get(type) ?? 0})
            </button>
          ))}
        </div>
      </section>

      <div className="text-manager-layout">
        <div className="text-manager-sidebar">
          <Card className="text-editor-card">
            <div className="text-section-header">
              <div>
                <h4>Neu anlegen</h4>
                <p className="section-copy">Name, Typ und Inhalt direkt erfassen.</p>
              </div>
            </div>
            <form className="form-grid" onSubmit={createText}>
              <div className="form-grid two-columns">
                <FormField label="Name" required>
                  <input value={newText.name} onChange={(event) => setNewText((current) => ({ ...current, name: event.target.value }))} />
                </FormField>
                <FormField label="Typ" required>
                  <input
                    list="badge-text-type-options"
                    value={newText.textType}
                    onChange={(event) => setNewText((current) => ({ ...current, textType: event.target.value }))}
                    placeholder="z. B. Sicherheit"
                  />
                </FormField>
              </div>
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
                <textarea className="text-editor-area text-editor-area-compact" rows={6} value={newText.content} onChange={(event) => setNewText((current) => ({ ...current, content: event.target.value }))} />
              </FormField>
              <div className="row-actions text-editor-actions">
                <button type="submit">Anlegen</button>
                <button type="button" className="secondary-button" onClick={() => setPreviewText(newText)} disabled={!newText.name.trim() && !newText.content.trim()}>
                  Vorschau
                </button>
                <button type="button" className="secondary-button" onClick={() => openPrintPreview(newText)} disabled={!newText.name.trim() && !newText.content.trim()}>
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
                <h4>Vorhandene Texte</h4>
                <p className="section-copy">{filteredTexts.length} von {texts.length} Eintraegen sichtbar.</p>
              </div>
            </div>
            <div className="text-record-list">
              {filteredTexts.length ? filteredTexts.map((text) => {
                const draft = editableTexts[text.id] ?? text;
                const dirty = isDirty(text, draft);

                return (
                  <button
                    key={text.id}
                    type="button"
                    className={selectedTextId === text.id ? "text-record-button active-record" : "text-record-button"}
                    onClick={() => setSelectedTextId(text.id)}
                  >
                    <div className="text-record-header">
                      <strong>{text.name}</strong>
                      <span className="field-config-badge">{text.isActive ? "Aktiv" : "Inaktiv"}</span>
                    </div>
                    <div className="text-record-meta">
                      <span className="field-config-badge">{formatTextType(text.textType)}</span>
                      {dirty ? <span className="field-config-badge">Ungespeichert</span> : null}
                    </div>
                    <p>{summarizeContent(draft.content)}</p>
                  </button>
                );
              }) : (
                <div className="text-empty-state">
                  Keine Texte fuer die aktuelle Suche gefunden.
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
                  <h4>{selectedText.name}</h4>
                  <p className="section-copy">{formatTextType(selectedDraft.textType)}</p>
                </div>
                <div className="text-detail-status">
                  <span className="field-config-badge">{selectedDraft.isActive ? "Aktiv" : "Inaktiv"}</span>
                  {isDirty(selectedText, selectedDraft) ? <span className="field-config-badge">Ungespeichert</span> : null}
                </div>
              </div>

              <div className="form-grid">
                <div className="form-grid two-columns">
                  <FormField label="Name">
                    <input value={selectedDraft.name} onChange={(event) => updateSelectedText("name", event.target.value)} />
                  </FormField>
                  <FormField label="Typ">
                    <input
                      list="badge-text-type-options"
                      value={selectedDraft.textType}
                      onChange={(event) => updateSelectedText("textType", event.target.value)}
                    />
                  </FormField>
                </div>

                <div className="text-type-chip-row">
                  {knownTypes.map((type) => (
                    <button
                      key={type}
                      type="button"
                      className={selectedDraft.textType === type ? "secondary-button active-chip" : "secondary-button"}
                      onClick={() => updateSelectedText("textType", type)}
                    >
                      {formatTextType(type)}
                    </button>
                  ))}
                </div>

                <label className="checkbox-row text-active-toggle">
                  <input type="checkbox" checked={selectedDraft.isActive} onChange={(event) => updateSelectedText("isActive", event.target.checked)} />
                  Aktiv
                </label>

                <FormField label="Inhalt">
                  <textarea
                    className="text-editor-area"
                    rows={14}
                    value={selectedDraft.content}
                    onChange={(event) => updateSelectedText("content", event.target.value)}
                  />
                </FormField>

                <div className="row-actions text-editor-actions">
                  <button type="button" onClick={() => void saveText(selectedDraft)} disabled={savePendingId === selectedDraft.id}>
                    {savePendingId === selectedDraft.id ? "Speichert..." : "Speichern"}
                  </button>
                  <button type="button" className="secondary-button" onClick={() => setPreviewText(selectedDraft)}>
                    Vorschau
                  </button>
                  <button type="button" className="secondary-button" onClick={() => openPrintPreview(selectedDraft)}>
                    Drucken
                  </button>
                  <button type="button" className="secondary-button" onClick={() => duplicateIntoNewText()}>
                    Duplizieren
                  </button>
                  <button type="button" className="secondary-button" onClick={() => resetSelectedDraft()} disabled={!isDirty(selectedText, selectedDraft)}>
                    Zuruecksetzen
                  </button>
                  <button type="button" className="danger-button" onClick={() => void toggleTextActive(selectedText)}>
                    {selectedText.isActive ? "Deaktivieren" : "Reaktivieren"}
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="text-empty-state text-empty-state-large">
              Links einen Text auswaehlen, um ihn zu bearbeiten.
            </div>
          )}
        </Card>
      </div>

      <datalist id="badge-text-type-options">
        {knownTypes.map((type) => <option key={type} value={type} />)}
      </datalist>

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
