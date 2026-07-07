import { Card } from "../ui";

type ImportUploadCardProps = {
  importFile: File | null;
  importing: boolean;
  onFileChange: (file: File | null) => void;
  onImport: () => void;
};

export function ImportUploadCard({
  importFile,
  importing,
  onFileChange,
  onImport
}: ImportUploadCardProps) {
  return (
    <Card className="import-card">
      <h3>Datei importieren</h3>
      <div className="toolbar filter-bar import-export-bar">
        <input
          type="file"
          accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
          onChange={(event) => onFileChange(event.target.files?.[0] ?? null)}
        />
        <button type="button" onClick={onImport} disabled={importing || !importFile}>
          {importing ? "Importiert..." : "Besucher importieren"}
        </button>
      </div>
      {importFile ? <p className="muted-text">Ausgewählt: {importFile.name}</p> : null}
    </Card>
  );
}
