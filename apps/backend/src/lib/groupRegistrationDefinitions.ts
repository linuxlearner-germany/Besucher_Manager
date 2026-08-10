export type GroupRegistrationInput = {
  sourceRowNumber?: number;
  gateId?: string | null;
  gateName?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  company?: string | null;
  visitorStreet?: string | null;
  visitorHouseNumber?: string | null;
  visitorPostalCode?: string | null;
  visitorCity?: string | null;
  nationalityCode?: string | null;
  birthDate?: string | null;
  phone?: string | null;
  email?: string | null;
  licensePlate?: string | null;
  hostName?: string | null;
  hostEmail?: string | null;
  hostPhone?: string | null;
  hostDepartment?: string | null;
  purpose?: string | null;
  validFrom?: string | null;
  validUntil?: string | null;
  idDocumentType?: string | null;
  idDocumentValidUntil?: string | null;
  idDocumentNumber?: string | null;
  notes?: string | null;
};

export type GroupRegistrationResult = {
  rowNumber: number;
  visitId: string;
  visitorId: string;
  badgeNumber: string;
  visitorName: string;
  company: string;
  missingFields: string[];
  warnings: string[];
  needsReview: boolean;
};

export type GroupRegistrationResultSet = {
  imported: number;
  needsReview: number;
  rows: GroupRegistrationResult[];
};
