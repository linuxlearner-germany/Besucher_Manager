import { useState, type ChangeEvent, type DragEvent } from "react";
import { Card } from "../ui";

type ImportTemplateCardProps = {
  onDownloadExcel: () => void;
  importFile: File | null;
  importing: boolean;
  onFileChange: (file: File | null) => void;
  onImport: () => void;
  importDisabledHint?: string | null;
};

export function ImportTemplateCard({
  onDownloadExcel,
  importFile,
  importing,
  onFileChange,
  onImport,
  importDisabledHint
}: ImportTemplateCardProps) {
  const [dragActive, setDragActive] = useState(false);

  function handleFileInput(event: ChangeEvent<HTMLInputElement>) {
    onFileChange(event.target.files?.[0] ?? null);
    event.target.value = "";
  }

  function handleDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setDragActive(false);
    onFileChange(event.dataTransfer.files?.[0] ?? null);
  }

  return (
    <Card className="import-card">
      <div className="card-header-row">
        <h3>Besucherimport mit Excel</h3>
      </div>
      <div className="import-step-list">
        <div className="import-step-item"><strong>1.</strong><span>Vorlage herunterladen</span></div>
        <div className="import-step-item"><strong>2.</strong><span>Datei auswählen</span></div>
        <div className="import-step-item"><strong>3.</strong><span>Import prüfen</span></div>
        <div className="import-step-item"><strong>4.</strong><span>Import ausführen</span></div>
      </div>
      <div className="row-actions import-actions-inline">
        <button type="button" onClick={onDownloadExcel}>Excel-Vorlage herunterladen</button>
      </div>
      <label
        className={`dropzone compact-dropzone ${dragActive ? "dropzone-active" : ""}`}
        onDragEnter={(event) => {
          event.preventDefault();
          setDragActive(true);
        }}
        onDragOver={(event) => {
          event.preventDefault();
          setDragActive(true);
        }}
        onDragLeave={(event) => {
          event.preventDefault();
          setDragActive(false);
        }}
        onDrop={handleDrop}
      >
        <input
          className="visually-hidden"
          type="file"
          accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
          onChange={handleFileInput}
        />
        <div className="dropzone-copy">
          <strong>Excel-Datei auswählen</strong>
          <span>XLSX oder XLS</span>
        </div>
        {importFile ? (
          <div className="dropzone-selected">
            <span>Datei: {importFile.name}</span>
          </div>
        ) : null}
      </label>
      <div className="row-actions import-dropzone-actions import-actions-inline">
        <button type="button" onClick={onImport} disabled={importing || !importFile}>
          {importing ? "Importiert..." : "Besucher importieren"}
        </button>
        {!importFile && importDisabledHint ? <span className="inline-note">{importDisabledHint}</span> : null}
      </div>
    </Card>
  );
}
