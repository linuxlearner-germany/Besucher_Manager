import { type ChangeEvent, type Dispatch, type FormEvent, type SetStateAction, useMemo } from "react";
import { type AdminFieldDefinition, type NewFieldDefinitionForm } from "../../app/core";
import { Card, FormField } from "../ui";

type FieldImportPreview = {
  valid: boolean;
  summary: { total: number; willUpdate: number; willCreate: number; willSkip: number; warnings: string[] };
  changes: Array<{ fieldKey: string; action: "update" | "create"; label: string }>;
};

type AdminFieldDefinitionsSectionProps = {
  fieldDefinitions: AdminFieldDefinition[];
  editableFieldDefinitions: Record<string, AdminFieldDefinition>;
  setEditableFieldDefinitions: Dispatch<SetStateAction<Record<string, AdminFieldDefinition>>>;
  selectedFieldDefinitionId: string | null;
  setSelectedFieldDefinitionId: Dispatch<SetStateAction<string | null>>;
  selectedFieldSection: string | null;
  setSelectedFieldSection: Dispatch<SetStateAction<string | null>>;
  isCreateFieldModalOpen: boolean;
  setIsCreateFieldModalOpen: Dispatch<SetStateAction<boolean>>;
  newFieldDefinition: NewFieldDefinitionForm;
  setNewFieldDefinition: Dispatch<SetStateAction<NewFieldDefinitionForm>>;
  fieldImportText: string;
  fieldImportFileName: string;
  fieldImportPreview: FieldImportPreview | null;
  handleImportConfigFile: (event: ChangeEvent<HTMLInputElement>) => Promise<void>;
  previewFieldImport: () => Promise<void>;
  confirmFieldImport: () => Promise<void>;
  exportFieldConfiguration: () => Promise<void>;
  saveFieldDefinition: (fieldId: string) => Promise<void>;
  createFieldDefinition: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  toggleFieldDefinitionActive: (field: AdminFieldDefinition) => Promise<void>;
};

const fieldSectionOrder = ["Besucher", "Adresse", "Ansprechpartner", "Besuch", "Ausweis", "Ziel/Raum", "Sonstiges"];
const hiddenSections = new Set(["Geraete", "Mitgefuehrte Geraete"]);
const hiddenFieldKeys = new Set(["visitor_address", "id_document_issuing_place"]);
const fieldSectionDescriptions: Record<string, string> = {
  Besucher: "Daten zur besuchenden Person.",
  Adresse: "Strukturierte Adressdaten für Check-in und Druck.",
  Ansprechpartner: "Kontakt zur empfangenden Person im Unternehmen.",
  Besuch: "Besuchszweck, Gültigkeitszeitraum und Ablaufdaten.",
  Ausweis: "Ausweisdaten für Voranmeldung und Wache.",
  "Ziel/Raum": "Interne Ziel-, Gebäude- und Raumangaben.",
  Sonstiges: "Zusatzfelder ohne feste Kategorie."
};

export function AdminFieldDefinitionsSection({
  fieldDefinitions,
  editableFieldDefinitions,
  setEditableFieldDefinitions,
  selectedFieldDefinitionId,
  setSelectedFieldDefinitionId,
  selectedFieldSection,
  setSelectedFieldSection,
  isCreateFieldModalOpen,
  setIsCreateFieldModalOpen,
  newFieldDefinition,
  setNewFieldDefinition,
  fieldImportText,
  fieldImportFileName,
  fieldImportPreview,
  handleImportConfigFile,
  previewFieldImport,
  confirmFieldImport,
  exportFieldConfiguration,
  saveFieldDefinition,
  createFieldDefinition,
  toggleFieldDefinitionActive
}: AdminFieldDefinitionsSectionProps) {
  const selectedFieldDefinition = selectedFieldDefinitionId ? editableFieldDefinitions[selectedFieldDefinitionId] || null : null;

  const groupedFieldDefinitions = useMemo(() => {
    const bySection = new Map<string, AdminFieldDefinition[]>();

    for (const item of fieldDefinitions) {
      if (hiddenSections.has(item.section?.trim() || "") || hiddenFieldKeys.has(item.fieldKey)) {
        continue;
      }

      const section = item.section?.trim() || "Sonstiges";
      if (!bySection.has(section)) {
        bySection.set(section, []);
      }
      bySection.get(section)?.push(item);
    }

    for (const list of bySection.values()) {
      list.sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label));
    }

    const orderedKeys = [
      ...fieldSectionOrder.filter((key) => bySection.has(key)),
      ...Array.from(bySection.keys()).filter((key) => !fieldSectionOrder.includes(key)).sort((a, b) => a.localeCompare(b))
    ];

    return orderedKeys.map((section) => ({ section, items: bySection.get(section) || [] }));
  }, [fieldDefinitions]);

  const selectedFieldSectionGroup = selectedFieldSection
    ? groupedFieldDefinitions.find((entry) => entry.section === selectedFieldSection) || null
    : null;

  return (
    <Card className="admin-fields-card">
      <h3>Feldkonfiguration</h3>
      <p className="section-copy">Konfigurieren Sie die Felder als Modul-Baukasten. Öffnen Sie ein Modul, um nur die zugehörigen Felder zu bearbeiten.</p>
      <div className="panel field-config-transfer">
        <h4>Import / Export</h4>
        <p className="section-copy">Import-Modus: Zusammenführen. Vorhandene Felder werden anhand ihres Keys aktualisiert, nicht enthaltene Felder bleiben erhalten.</p>
        <div className="row-actions action-bar">
          <button type="button" onClick={() => void exportFieldConfiguration()}>Konfiguration exportieren</button>
          <label className="secondary-button file-button-inline">
            JSON-Datei auswählen
            <input type="file" accept="application/json,.json" onChange={(event) => void handleImportConfigFile(event)} />
          </label>
          <button type="button" className="secondary-button" onClick={() => void previewFieldImport()} disabled={!fieldImportText.trim()}>
            Import prüfen
          </button>
        </div>
        {fieldImportFileName ? <p className="section-copy">Datei: {fieldImportFileName}</p> : null}
        {fieldImportPreview ? (
          <div className="panel field-import-preview">
            <p>
              <strong>{fieldImportPreview.summary.total}</strong> Felder ·
              {" "}<strong>{fieldImportPreview.summary.willUpdate}</strong> aktualisiert ·
              {" "}<strong>{fieldImportPreview.summary.willCreate}</strong> neu
            </p>
            <div className="table-wrap">
              <table className="data-table">
                <thead><tr><th>Feld</th><th>Aktion</th><th>Label</th></tr></thead>
                <tbody>
                  {fieldImportPreview.changes.map((item) => (
                    <tr key={item.fieldKey}>
                      <td><code>{item.fieldKey}</code></td>
                      <td>{item.action === "update" ? "Update" : "Neu"}</td>
                      <td>{item.label}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="row-actions action-bar">
              <button type="button" onClick={() => void confirmFieldImport()}>Import bestätigen</button>
            </div>
          </div>
        ) : null}
      </div>

      {selectedFieldSectionGroup ? (
        <div className="field-module-detail">
          <div className="field-module-header">
            <div>
              <p className="eyebrow">Modul</p>
              <h4>{selectedFieldSectionGroup.section}</h4>
              <p className="section-copy">{fieldSectionDescriptions[selectedFieldSectionGroup.section] || "Feldgruppe für diesen Bereich."}</p>
            </div>
            <div className="row-actions action-bar">
              <button
                type="button"
                className="secondary-button"
                onClick={() => {
                  setSelectedFieldSection(null);
                  setSelectedFieldDefinitionId(null);
                }}
              >
                Zurück zur Modulübersicht
              </button>
              <button
                type="button"
                onClick={() => {
                  setNewFieldDefinition((current) => ({ ...current, section: selectedFieldSectionGroup.section }));
                  setIsCreateFieldModalOpen(true);
                }}
              >
                Neues Feld hinzufügen
              </button>
            </div>
          </div>
          <div className="field-section-list">
            {selectedFieldSectionGroup.items.map((definition) => (
              <div key={definition.id} className="field-row-card">
                <div className="field-row-main">
                  <div className="field-row-title">{definition.label}</div>
                  <div className="field-row-meta">
                    <span className="field-row-key">{definition.fieldKey}</span>
                    <span>{definition.fieldType}</span>
                  </div>
                </div>
                <div className="field-row-badges">
                  {definition.isSystem ? <span className="field-config-badge">Systemfeld</span> : <span className="field-config-badge">Eigenes Feld</span>}
                  {definition.isActive ? <span className="field-config-badge">Aktiv</span> : <span className="field-config-badge">Inaktiv</span>}
                  {definition.showInPublic ? <span className="field-config-badge">Voranmeldung</span> : null}
                  {definition.showInGuard ? <span className="field-config-badge">Wache</span> : null}
                  {definition.showInSibe ? <span className="field-config-badge">SiBe</span> : null}
                  {definition.showOnBadge ? <span className="field-config-badge">Druck</span> : null}
                  {definition.requiredPublic ? <span className="field-config-badge">Pflicht Voranmeldung</span> : null}
                  {definition.requiredGuardCheckin ? <span className="field-config-badge">Pflicht Check-in</span> : null}
                  {definition.requiredBeforePrint ? <span className="field-config-badge">Pflicht Druck</span> : null}
                </div>
                <div className="field-row-actions">
                  <button type="button" className="secondary-button" onClick={() => setSelectedFieldDefinitionId(definition.id)}>
                    Bearbeiten
                  </button>
                  <button type="button" className="secondary-button" onClick={() => void toggleFieldDefinitionActive(definition)}>
                    {definition.isActive ? "Ausblenden" : "Reaktivieren"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="field-section-grid">
          {groupedFieldDefinitions.map(({ section, items }) => {
            const activeCount = items.filter((item) => item.isActive).length;
            const requiredPublicCount = items.filter((item) => item.requiredPublic && item.isActive).length;
            const requiredCheckinCount = items.filter((item) => item.requiredGuardCheckin && item.isActive).length;
            const requiredPrintCount = items.filter((item) => item.requiredBeforePrint && item.isActive).length;
            const printCount = items.filter((item) => item.showOnBadge && item.isActive).length;
            return (
              <article key={section} className="field-section-card">
                <div className="field-section-summary">
                  <h4>{section}</h4>
                  <p>{fieldSectionDescriptions[section] || "Feldgruppe fuer diesen Bereich."}</p>
                </div>
                <ul className="field-module-stats">
                  <li>{activeCount} aktive Felder</li>
                  <li>{requiredPublicCount} Pflicht in Voranmeldung</li>
                  <li>{requiredCheckinCount} Pflicht vor Check-in</li>
                  <li>{requiredPrintCount} Pflicht vor Druck</li>
                  <li>{printCount} Druckfelder</li>
                </ul>
                <div className="field-row-actions">
                  <button type="button" className="secondary-button" onClick={() => setSelectedFieldSection(section)}>
                    Öffnen
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedFieldSection(section);
                      setNewFieldDefinition((current) => ({ ...current, section }));
                      setIsCreateFieldModalOpen(true);
                    }}
                  >
                    Neues Feld in diesem Modul
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      <details className="field-expert-details">
        <summary>Expertenansicht anzeigen</summary>
        <div className="table-wrap admin-fields-wrap">
          <table className="data-table admin-fields-table">
            <thead>
              <tr>
                <th className="col-label">Label</th>
                <th className="col-key">Key</th>
                <th className="col-type">Typ</th>
                <th className="col-section">Bereich</th>
                <th className="col-flag">System</th>
                <th className="col-flag">Aktiv</th>
                <th className="col-flag">Public</th>
                <th className="col-flag">Wache</th>
                <th className="col-flag">SiBe</th>
                <th className="col-flag">Druck</th>
                <th className="col-flag">Pflicht Public</th>
                <th className="col-flag">Pflicht Check-in</th>
                <th className="col-flag">Pflicht Druck</th>
                <th className="col-order">Sortierung</th>
                <th className="col-actions">Aktion</th>
              </tr>
            </thead>
            <tbody>
              {fieldDefinitions.map((definition) => (
                <tr key={definition.id}>
                  <td className="col-label">{definition.label}</td>
                  <td className="col-key"><code>{definition.fieldKey}</code></td>
                  <td className="col-type">{definition.fieldType}</td>
                  <td className="col-section">{definition.section}</td>
                  <td className="col-flag">{definition.isSystem ? "Ja" : "Nein"}</td>
                  <td className="col-flag">{definition.isActive ? "Ja" : "Nein"}</td>
                  <td className="col-flag">{definition.showInPublic ? "Ja" : "Nein"}</td>
                  <td className="col-flag">{definition.showInGuard ? "Ja" : "Nein"}</td>
                  <td className="col-flag">{definition.showInSibe ? "Ja" : "Nein"}</td>
                  <td className="col-flag">{definition.showOnBadge ? "Ja" : "Nein"}</td>
                  <td className="col-flag">{definition.requiredPublic ? "Ja" : "Nein"}</td>
                  <td className="col-flag">{definition.requiredGuardCheckin ? "Ja" : "Nein"}</td>
                  <td className="col-flag">{definition.requiredBeforePrint ? "Ja" : "Nein"}</td>
                  <td className="col-order">{definition.sortOrder}</td>
                  <td className="col-actions">
                    <button type="button" className="secondary-button" onClick={() => setSelectedFieldDefinitionId(definition.id)}>
                      Bearbeiten
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>

      {selectedFieldDefinition ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true" onClick={(event) => {
          if (event.target === event.currentTarget) {
            setSelectedFieldDefinitionId(null);
          }
        }}>
          <div className="modal-card panel field-edit-modal">
            <div className="modal-header">
              <h4>Feld bearbeiten</h4>
              <button type="button" className="secondary-button modal-close-button" onClick={() => setSelectedFieldDefinitionId(null)}>
                Schließen
              </button>
            </div>
            <div className="field-edit-form">
              <h5>Stammdaten</h5>
              <div className="form-grid two-columns">
                <FormField label="Label">
                  <input
                    value={selectedFieldDefinition.label}
                    onChange={(event) => setEditableFieldDefinitions((current) => ({
                      ...current,
                      [selectedFieldDefinition.id]: { ...selectedFieldDefinition, label: event.target.value }
                    }))}
                  />
                </FormField>
                <FormField label="Key">
                  <input value={selectedFieldDefinition.fieldKey} readOnly />
                </FormField>
                <FormField label="Typ">
                  <input value={selectedFieldDefinition.fieldType} readOnly />
                </FormField>
                <FormField label="Bereich">
                  <input
                    value={selectedFieldDefinition.section}
                    onChange={(event) => setEditableFieldDefinitions((current) => ({
                      ...current,
                      [selectedFieldDefinition.id]: { ...selectedFieldDefinition, section: event.target.value }
                    }))}
                  />
                </FormField>
                <FormField label="Sortierung">
                  <input
                    type="number"
                    value={selectedFieldDefinition.sortOrder}
                    onChange={(event) => setEditableFieldDefinitions((current) => ({
                      ...current,
                      [selectedFieldDefinition.id]: { ...selectedFieldDefinition, sortOrder: Number(event.target.value) || 0 }
                    }))}
                  />
                </FormField>
                <FormField label="Hilfetext">
                  <input
                    value={selectedFieldDefinition.helpText || ""}
                    onChange={(event) => setEditableFieldDefinitions((current) => ({
                      ...current,
                      [selectedFieldDefinition.id]: { ...selectedFieldDefinition, helpText: event.target.value }
                    }))}
                  />
                </FormField>
              </div>

              <h5>Sichtbarkeit</h5>
              <p className="section-copy">Legen Sie fest, in welchem Bereich dieses Feld sichtbar ist.</p>
              <div className="form-grid two-columns">
                <label className="checkbox-row"><input type="checkbox" checked={selectedFieldDefinition.showInPublic} onChange={(event) => setEditableFieldDefinitions((current) => ({ ...current, [selectedFieldDefinition.id]: { ...selectedFieldDefinition, showInPublic: event.target.checked } }))} />In Voranmeldung anzeigen<div className="field-help-text">Dieses Feld erscheint im Formular fuer Mitarbeiter ohne Login.</div></label>
                <label className="checkbox-row"><input type="checkbox" checked={selectedFieldDefinition.showInGuard} onChange={(event) => setEditableFieldDefinitions((current) => ({ ...current, [selectedFieldDefinition.id]: { ...selectedFieldDefinition, showInGuard: event.target.checked } }))} />In Wache anzeigen<div className="field-help-text">Dieses Feld ist in der Wache-Detailansicht sichtbar und bearbeitbar.</div></label>
                <label className="checkbox-row"><input type="checkbox" checked={selectedFieldDefinition.showInSibe} onChange={(event) => setEditableFieldDefinitions((current) => ({ ...current, [selectedFieldDefinition.id]: { ...selectedFieldDefinition, showInSibe: event.target.checked } }))} />In SiBe anzeigen<div className="field-help-text">Dieses Feld ist in der lesenden SiBe-Ansicht sichtbar.</div></label>
                <label className="checkbox-row"><input type="checkbox" checked={selectedFieldDefinition.showOnBadge} onChange={(event) => setEditableFieldDefinitions((current) => ({ ...current, [selectedFieldDefinition.id]: { ...selectedFieldDefinition, showOnBadge: event.target.checked } }))} />Auf Besucherschein drucken<div className="field-help-text">Dieses Feld wird auf dem Druckschein ausgegeben.</div></label>
              </div>

              <h5>Pflichtregeln</h5>
              <p className="section-copy">Pflichtregeln steuern, wann ein Feld zwingend ausgefuellt sein muss.</p>
              <div className="form-grid two-columns">
                <label className="checkbox-row"><input type="checkbox" checked={selectedFieldDefinition.requiredPublic} onChange={(event) => setEditableFieldDefinitions((current) => ({ ...current, [selectedFieldDefinition.id]: { ...selectedFieldDefinition, requiredPublic: event.target.checked } }))} />Pflicht in Voranmeldung<div className="field-help-text">Mitarbeiter muessen dieses Feld beim Anmelden ausfuellen.</div></label>
                <label className="checkbox-row"><input type="checkbox" checked={selectedFieldDefinition.requiredGuardCheckin} onChange={(event) => setEditableFieldDefinitions((current) => ({ ...current, [selectedFieldDefinition.id]: { ...selectedFieldDefinition, requiredGuardCheckin: event.target.checked } }))} />Pflicht vor Check-in<div className="field-help-text">Die Wache muss dieses Feld vor dem Check-in ergaenzen.</div></label>
                <label className="checkbox-row"><input type="checkbox" checked={selectedFieldDefinition.requiredBeforePrint} onChange={(event) => setEditableFieldDefinitions((current) => ({ ...current, [selectedFieldDefinition.id]: { ...selectedFieldDefinition, requiredBeforePrint: event.target.checked } }))} />Pflicht vor Druck<div className="field-help-text">Der Besucherschein darf erst nach Ergaenzung gedruckt werden.</div></label>
              </div>

              <h5>Status</h5>
              <div className="form-grid two-columns">
                <label className="checkbox-row"><input type="checkbox" checked={selectedFieldDefinition.isActive} onChange={(event) => setEditableFieldDefinitions((current) => ({ ...current, [selectedFieldDefinition.id]: { ...selectedFieldDefinition, isActive: event.target.checked } }))} />Aktiv<div className="field-help-text">Inaktive Felder bleiben in Daten erhalten, werden aber nicht mehr aktiv verwendet.</div></label>
                <label className="checkbox-row"><input type="checkbox" checked={selectedFieldDefinition.isSystem} readOnly disabled />Systemfeld<div className="field-help-text">Systemfelder gehoeren zum Grundsystem und sind nicht loeschbar.</div></label>
              </div>
            </div>
            <div className="row-actions action-bar modal-actions">
              <button type="button" onClick={() => void saveFieldDefinition(selectedFieldDefinition.id)}>Speichern</button>
              <button type="button" className="secondary-button" onClick={() => setSelectedFieldDefinitionId(null)}>Abbrechen</button>
            </div>
          </div>
        </div>
      ) : null}

      {isCreateFieldModalOpen ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true" onClick={(event) => {
          if (event.target === event.currentTarget) {
            setIsCreateFieldModalOpen(false);
          }
        }}>
          <div className="modal-card panel field-edit-modal">
            <div className="modal-header">
              <h4>Neues Feld hinzufügen</h4>
              <button type="button" className="secondary-button modal-close-button" onClick={() => setIsCreateFieldModalOpen(false)}>
                Schließen
              </button>
            </div>
            <form className="field-edit-form" onSubmit={createFieldDefinition}>
              <h5>Stammdaten</h5>
              <div className="form-grid two-columns">
                <FormField label="Label" required><input value={newFieldDefinition.label} onChange={(event) => setNewFieldDefinition((current) => ({ ...current, label: event.target.value }))} /></FormField>
                <FormField label="Feldtyp" required>
                  <select value={newFieldDefinition.fieldType} onChange={(event) => setNewFieldDefinition((current) => ({ ...current, fieldType: event.target.value }))}>
                    <option value="text">Text</option>
                    <option value="textarea">Mehrzeiliger Text</option>
                    <option value="date">Datum</option>
                    <option value="email">E-Mail</option>
                    <option value="phone">Telefon</option>
                    <option value="number">Zahl</option>
                    <option value="checkbox">Checkbox</option>
                    <option value="select">Auswahlfeld</option>
                  </select>
                </FormField>
                <FormField label="Bereich" required><input value={newFieldDefinition.section} onChange={(event) => setNewFieldDefinition((current) => ({ ...current, section: event.target.value }))} /></FormField>
                <FormField label="Sortierung"><input type="number" value={newFieldDefinition.sortOrder} onChange={(event) => setNewFieldDefinition((current) => ({ ...current, sortOrder: Number(event.target.value) || 0 }))} /></FormField>
                <FormField label="Hilfetext"><input value={newFieldDefinition.helpText} onChange={(event) => setNewFieldDefinition((current) => ({ ...current, helpText: event.target.value }))} /></FormField>
                {newFieldDefinition.fieldType === "select" ? <FormField label="Optionen (eine pro Zeile)"><textarea rows={4} value={newFieldDefinition.optionsJson} onChange={(event) => setNewFieldDefinition((current) => ({ ...current, optionsJson: event.target.value }))} /></FormField> : null}
              </div>

              <h5>Sichtbarkeit</h5>
              <div className="form-grid two-columns">
                <label className="checkbox-row"><input type="checkbox" checked={newFieldDefinition.showInPublic} onChange={(event) => setNewFieldDefinition((current) => ({ ...current, showInPublic: event.target.checked }))} />In Voranmeldung anzeigen</label>
                <label className="checkbox-row"><input type="checkbox" checked={newFieldDefinition.showInGuard} onChange={(event) => setNewFieldDefinition((current) => ({ ...current, showInGuard: event.target.checked }))} />In Wache anzeigen</label>
                <label className="checkbox-row"><input type="checkbox" checked={newFieldDefinition.showInSibe} onChange={(event) => setNewFieldDefinition((current) => ({ ...current, showInSibe: event.target.checked }))} />In SiBe anzeigen</label>
                <label className="checkbox-row"><input type="checkbox" checked={newFieldDefinition.showOnBadge} onChange={(event) => setNewFieldDefinition((current) => ({ ...current, showOnBadge: event.target.checked }))} />Auf Besucherschein drucken</label>
              </div>

              <h5>Pflichtregeln</h5>
              <div className="form-grid two-columns">
                <label className="checkbox-row"><input type="checkbox" checked={newFieldDefinition.requiredPublic} onChange={(event) => setNewFieldDefinition((current) => ({ ...current, requiredPublic: event.target.checked }))} />Pflicht in Voranmeldung</label>
                <label className="checkbox-row"><input type="checkbox" checked={newFieldDefinition.requiredGuardCheckin} onChange={(event) => setNewFieldDefinition((current) => ({ ...current, requiredGuardCheckin: event.target.checked }))} />Pflicht vor Check-in</label>
                <label className="checkbox-row"><input type="checkbox" checked={newFieldDefinition.requiredBeforePrint} onChange={(event) => setNewFieldDefinition((current) => ({ ...current, requiredBeforePrint: event.target.checked }))} />Pflicht vor Druck</label>
                <label className="checkbox-row"><input type="checkbox" checked={newFieldDefinition.isActive} onChange={(event) => setNewFieldDefinition((current) => ({ ...current, isActive: event.target.checked }))} />Aktiv</label>
              </div>
              <div className="row-actions action-bar modal-actions">
                <button type="submit">Feld anlegen</button>
                <button type="button" className="secondary-button" onClick={() => setIsCreateFieldModalOpen(false)}>Abbrechen</button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </Card>
  );
}
