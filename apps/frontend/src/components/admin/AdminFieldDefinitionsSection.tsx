import { type ChangeEvent, type Dispatch, type SetStateAction, useMemo } from "react";
import { type AdminFieldDefinition } from "../../app/core";
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
  fieldImportText: string;
  fieldImportFileName: string;
  fieldImportPreview: FieldImportPreview | null;
  handleImportConfigFile: (event: ChangeEvent<HTMLInputElement>) => Promise<void>;
  previewFieldImport: () => Promise<void>;
  confirmFieldImport: () => Promise<void>;
  exportFieldConfiguration: () => Promise<void>;
  saveFieldDefinition: (fieldId: string) => Promise<void>;
  toggleFieldDefinitionActive: (field: AdminFieldDefinition) => Promise<void>;
};

const fieldSectionOrder = ["Besucher", "Adresse", "Ansprechpartner", "Besuch", "Ausweis", "Ziel/Raum", "Sonstiges"];
const hiddenSections = new Set(["Geraete", "Mitgefuehrte Geraete"]);
const hiddenFieldKeys = new Set(["visitor_address", "id_document_issuing_place"]);

export function AdminFieldDefinitionsSection({
  fieldDefinitions,
  editableFieldDefinitions,
  setEditableFieldDefinitions,
  selectedFieldDefinitionId,
  setSelectedFieldDefinitionId,
  selectedFieldSection,
  setSelectedFieldSection,
  fieldImportText,
  fieldImportFileName,
  fieldImportPreview,
  handleImportConfigFile,
  previewFieldImport,
  confirmFieldImport,
  exportFieldConfiguration,
  saveFieldDefinition,
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
      <div className="feedback info">Hier werden nur die vorhandenen Systemfelder verwaltet. Neue Felder werden nicht angelegt; Pflichtregeln lassen sich je Einsatzbereich bearbeiten.</div>

      {selectedFieldSectionGroup ? (
        <div className="field-module-detail">
          <div className="field-module-header">
            <div>
              <p className="eyebrow">Modul</p>
              <h4>{selectedFieldSectionGroup.section}</h4>
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
                  {definition.requiredGuardCheckin ? <span className="field-config-badge">Pflicht Check-in</span> : null}
                  {definition.requiredBeforePrint ? <span className="field-config-badge">Pflicht Druck</span> : null}
                </div>
                <div className="field-row-actions">
                  <div className="field-matrix-controls">
                    <label className="checkbox-row"><input type="checkbox" checked={editableFieldDefinitions[definition.id]?.requiredGuardCheckin ?? definition.requiredGuardCheckin} onChange={(event) => setEditableFieldDefinitions((current) => ({ ...current, [definition.id]: { ...(current[definition.id] || definition), requiredGuardCheckin: event.target.checked, showInGuard: event.target.checked || (current[definition.id] || definition).showInGuard } }))} /> Pflicht Check-in</label>
                    <label className="checkbox-row"><input type="checkbox" checked={editableFieldDefinitions[definition.id]?.requiredBeforePrint ?? definition.requiredBeforePrint} onChange={(event) => setEditableFieldDefinitions((current) => ({ ...current, [definition.id]: { ...(current[definition.id] || definition), requiredBeforePrint: event.target.checked, showOnBadge: event.target.checked || (current[definition.id] || definition).showOnBadge } }))} /> Pflicht Druck</label>
                    <button type="button" onClick={() => void saveFieldDefinition(definition.id)}>Speichern</button>
                  </div>
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
            const requiredCheckinCount = items.filter((item) => item.requiredGuardCheckin && item.isActive).length;
            const requiredPrintCount = items.filter((item) => item.requiredBeforePrint && item.isActive).length;
            const printCount = items.filter((item) => item.showOnBadge && item.isActive).length;
            return (
              <article key={section} className="field-section-card">
                <div className="field-section-summary">
                  <h4>{section}</h4>
                </div>
                <ul className="field-module-stats">
                  <li>{activeCount} aktive Felder</li>
                  <li>Voranmeldungsfelder sind optional</li>
                  <li>{requiredCheckinCount} Pflicht vor Check-in</li>
                  <li>{requiredPrintCount} Pflicht vor Druck</li>
                  <li>{printCount} Druckfelder</li>
                </ul>
                <div className="field-row-actions">
                  <button type="button" className="secondary-button" onClick={() => setSelectedFieldSection(section)}>
                    Öffnen
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      <details className="field-expert-details" hidden>
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
                <FormField label="Label" required>
                  <input
                    required
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
                <FormField label="Bereich" required>
                  <input
                    required
                    value={selectedFieldDefinition.section}
                    onChange={(event) => setEditableFieldDefinitions((current) => ({
                      ...current,
                      [selectedFieldDefinition.id]: { ...selectedFieldDefinition, section: event.target.value }
                    }))}
                  />
                </FormField>
                <FormField label="Sortierung" required>
                  <input
                    required
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
              <div className="form-grid two-columns">
                <label className="checkbox-row"><input type="checkbox" checked={selectedFieldDefinition.showInPublic} onChange={(event) => setEditableFieldDefinitions((current) => ({ ...current, [selectedFieldDefinition.id]: { ...selectedFieldDefinition, showInPublic: event.target.checked } }))} />In Voranmeldung anzeigen</label>
                <label className="checkbox-row"><input type="checkbox" checked={selectedFieldDefinition.showInGuard} onChange={(event) => setEditableFieldDefinitions((current) => ({ ...current, [selectedFieldDefinition.id]: { ...selectedFieldDefinition, showInGuard: event.target.checked } }))} />In Wache anzeigen</label>
                <label className="checkbox-row"><input type="checkbox" checked={selectedFieldDefinition.showInSibe} onChange={(event) => setEditableFieldDefinitions((current) => ({ ...current, [selectedFieldDefinition.id]: { ...selectedFieldDefinition, showInSibe: event.target.checked } }))} />In SiBe anzeigen</label>
                <label className="checkbox-row"><input type="checkbox" checked={selectedFieldDefinition.showOnBadge} onChange={(event) => setEditableFieldDefinitions((current) => ({ ...current, [selectedFieldDefinition.id]: { ...selectedFieldDefinition, showOnBadge: event.target.checked } }))} />Auf Besucherschein drucken</label>
              </div>

              <h5>Pflichtregeln</h5>
              <div className="form-grid two-columns">
                <p className="section-copy">Für Voranmeldungen sind alle Felder optional. Pflichtregeln gelten erst für nachgelagerte Abläufe.</p>
                <label className="checkbox-row"><input type="checkbox" checked={selectedFieldDefinition.requiredGuardCheckin} onChange={(event) => setEditableFieldDefinitions((current) => ({ ...current, [selectedFieldDefinition.id]: { ...selectedFieldDefinition, requiredGuardCheckin: event.target.checked, showInGuard: event.target.checked || selectedFieldDefinition.showInGuard } }))} />Pflicht vor Check-in</label>
                <label className="checkbox-row"><input type="checkbox" checked={selectedFieldDefinition.requiredBeforePrint} onChange={(event) => setEditableFieldDefinitions((current) => ({ ...current, [selectedFieldDefinition.id]: { ...selectedFieldDefinition, requiredBeforePrint: event.target.checked, showOnBadge: event.target.checked || selectedFieldDefinition.showOnBadge } }))} />Pflicht vor Druck</label>
              </div>

              <h5>Status</h5>
              <div className="form-grid two-columns">
                <label className="checkbox-row"><input type="checkbox" checked={selectedFieldDefinition.isActive} onChange={(event) => setEditableFieldDefinitions((current) => ({ ...current, [selectedFieldDefinition.id]: { ...selectedFieldDefinition, isActive: event.target.checked } }))} />Aktiv</label>
                <label className="checkbox-row"><input type="checkbox" checked={selectedFieldDefinition.isSystem} readOnly disabled />Systemfeld</label>
              </div>
            </div>
            <div className="row-actions action-bar modal-actions">
              <button type="button" onClick={() => void saveFieldDefinition(selectedFieldDefinition.id)}>Speichern</button>
              <button type="button" className="secondary-button" onClick={() => setSelectedFieldDefinitionId(null)}>Abbrechen</button>
            </div>
          </div>
        </div>
      ) : null}

    </Card>
  );
}
