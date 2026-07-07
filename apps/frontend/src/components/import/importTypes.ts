export type ImportResultRow = {
  rowNumber: number;
  visitId: string;
  visitorName: string;
  company: string;
  missingFields: string[];
  warnings: string[];
  needsReview: boolean;
};

export type ImportResult = {
  imported: number;
  needsReview: number;
  message: string;
  rows: ImportResultRow[];
};
