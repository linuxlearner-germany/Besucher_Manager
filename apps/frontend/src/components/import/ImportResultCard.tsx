import { Link } from "react-router-dom";
import { Card } from "../ui";
import type { ImportResult } from "./importTypes";

type ImportResultCardProps = {
  result: ImportResult;
  detailBasePath: string;
  canOpenDetails: boolean;
};

function formatRowStatus(row: ImportResult["rows"][number]): string {
  if (!row.needsReview) {
    return "Importiert";
  }

  return [...row.missingFields, ...row.warnings].join(" ") || "Nachbearbeitung";
}

export function ImportResultCard({
  result,
  detailBasePath,
  canOpenDetails
}: ImportResultCardProps) {
  if (result.rows.length === 0) {
    return null;
  }

  return (
    <Card className="import-card">
      <h3>Import-Ergebnis</h3>
      <div className="hero-stat-grid compact-stat-grid">
        <div className="hero-stat-card">
          <span className="hero-stat-label">Verarbeitet</span>
          <strong className="hero-stat-value">{result.imported}</strong>
        </div>
        <div className="hero-stat-card">
          <span className="hero-stat-label">Nachbearbeitung</span>
          <strong className="hero-stat-value">{result.needsReview}</strong>
        </div>
      </div>
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Zeile</th>
              <th>Besucher</th>
              <th>Firma</th>
              <th>Status</th>
              <th>Aktion</th>
            </tr>
          </thead>
          <tbody>
            {result.rows.map((row) => (
              <tr key={row.visitId}>
                <td>{row.rowNumber}</td>
                <td>{row.visitorName}</td>
                <td>{row.company}</td>
                <td>{formatRowStatus(row)}</td>
                <td>
                  {canOpenDetails ? (
                    <Link className="button-link" to={`${detailBasePath}/${row.visitId}`}>Öffnen</Link>
                  ) : (
                    <span className="muted-text">Login für Details</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
