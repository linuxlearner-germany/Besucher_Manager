import { z } from "zod";
import { findCountryCode, normalizeCountryCode } from "./countries";
import { bundeswehrEmailSchema } from "./emailPolicy";
import type { ImportVisitInput } from "./visitImportDefinitions";

export const PUBLIC_FIELD_INPUT_MAP = {
  visitor_first_name: "firstName",
  visitor_last_name: "lastName",
  visitor_company: "company",
  visitor_street: "visitorStreet",
  visitor_house_number: "visitorHouseNumber",
  visitor_postal_code: "visitorPostalCode",
  visitor_city: "visitorCity",
  visitor_nationality: "nationalityCode",
  visitor_birth_date: "birthDate",
  visitor_phone: "phone",
  visitor_email: "email",
  visitor_license_plate: "licensePlate",
  host_name: "hostName",
  host_email: "hostEmail",
  host_phone: "hostPhone",
  host_department: "hostDepartment",
  visit_purpose: "purpose",
  valid_from: "validFrom",
  valid_until: "validUntil",
  visit_note: "notes",
  id_document_type: "idDocumentType",
  id_document_valid_until: "idDocumentValidUntil",
  id_document_number: "idDocumentNumber"
} as const;

export type PublicFieldKey = keyof typeof PUBLIC_FIELD_INPUT_MAP;

const defaultRequiredFieldKeys = new Set<PublicFieldKey>([
  "visitor_first_name",
  "visitor_last_name",
  "visitor_company",
  "visitor_street",
  "visitor_house_number",
  "visitor_postal_code",
  "visitor_city",
  "visitor_nationality",
  "host_name",
  "host_phone",
  "visit_purpose",
  "valid_from",
  "valid_until",
  "id_document_type",
  "id_document_valid_until",
  "id_document_number"
]);

export function createPublicPreRegistrationSchema(requiredFieldKeys: ReadonlySet<PublicFieldKey> = defaultRequiredFieldKeys) {
  return z
  .object({
    gateId: z.string().uuid().optional().or(z.literal("")),
    firstName: z.string().trim().max(120).optional().default(""),
    lastName: z.string().trim().max(120).optional().default(""),
    company: z.string().trim().max(255).optional().default(""),
    visitorStreet: z.string().trim().max(255).optional().default(""),
    visitorHouseNumber: z.string().trim().max(40).optional().default(""),
    visitorPostalCode: z.string().trim().max(20).optional().default(""),
    visitorCity: z.string().trim().max(120).optional().default(""),
    nationalityCode: z.string().trim().optional().transform((value, context) => {
      if (!value) return null;
      const code = normalizeCountryCode(value);
      if (!code) {
        context.addIssue({ code: z.ZodIssueCode.custom, message: "Bitte eine gültige Nationalität auswählen." });
        return z.NEVER;
      }
      return code;
    }),
    hostName: z.string().trim().max(255).optional().default(""),
    hostEmail: bundeswehrEmailSchema.optional().or(z.literal("")),
    hostPhone: z.string().trim().max(80).optional().default(""),
    hostDepartment: z.string().trim().optional(),
    purpose: z.string().trim().max(500).optional().default(""),
    validFrom: z.string().trim().optional().default(""),
    validUntil: z.string().trim().optional().default(""),
    expectedArrivalTime: z.string().trim().regex(/^$|^([01]\d|2[0-3]):[0-5]\d$/, "Bitte eine gültige Ankunftszeit angeben.").optional().default(""),
    birthDate: z.string().trim().optional().or(z.literal("")),
    phone: z.string().trim().optional(),
    email: z.string().trim().email("Ungültige E-Mail-Adresse.").optional().or(z.literal("")),
    licensePlate: z.string().trim().optional(),
    idDocumentType: z.enum(["identity_card", "passport", "service_id", "other"]).optional().or(z.literal("")),
    idDocumentValidUntil: z.string().trim().optional().default(""),
    idDocumentNumber: z.string().trim().max(120).optional().default(""),
    notes: z.string().trim().optional()
  })
  .superRefine((value, context) => {
    for (const fieldKey of requiredFieldKeys) {
      const inputKey = PUBLIC_FIELD_INPUT_MAP[fieldKey];
      if (!String(value[inputKey] ?? "").trim()) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: [inputKey],
          message: "Dieses Pflichtfeld ist erforderlich."
        });
      }
    }

    const validFrom = new Date(value.validFrom);
    const validUntil = new Date(value.validUntil);

    if (value.validFrom && Number.isNaN(validFrom.getTime())) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["validFrom"],
        message: "Ungültiger Startzeitpunkt."
      });
    }

    if (value.validUntil && Number.isNaN(validUntil.getTime())) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["validUntil"],
        message: "Ungültiger Endzeitpunkt."
      });
    }

    if (!Number.isNaN(validFrom.getTime()) && !Number.isNaN(validUntil.getTime()) && validUntil < validFrom) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["validUntil"],
        message: "Gültig bis darf nicht vor Gültig von liegen."
      });
    }

    if (value.birthDate) {
      const birthDate = new Date(value.birthDate);
      const now = new Date();

      if (Number.isNaN(birthDate.getTime())) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["birthDate"],
          message: "Ungültiges Geburtsdatum."
        });
      } else if (birthDate > now) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["birthDate"],
          message: "Geburtsdatum darf nicht in der Zukunft liegen."
        });
      }
    }

    const idDocumentValidUntil = new Date(value.idDocumentValidUntil);
    if (value.idDocumentValidUntil && Number.isNaN(idDocumentValidUntil.getTime())) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["idDocumentValidUntil"],
        message: "Ungültiges Ablaufdatum."
      });
    }
  });
}

export const publicPreRegistrationSchema = createPublicPreRegistrationSchema();

export type PublicPreRegistrationInput = z.infer<typeof publicPreRegistrationSchema>;

function normalizeImportDateForValidation(value: string | null | undefined): string {
  const cleaned = String(value ?? "").trim();
  if (!cleaned) return "";

  const germanDate = cleaned.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (germanDate) {
    const [, day, month, year] = germanDate;
    const normalized = `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
    const parsed = new Date(`${normalized}T00:00:00.000Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === normalized ? normalized : cleaned;
  }

  const dateOnly = cleaned.match(/^\d{4}-\d{2}-\d{2}$/);
  if (dateOnly) {
    const parsed = new Date(`${cleaned}T00:00:00.000Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === cleaned ? cleaned : cleaned;
  }

  return cleaned;
}

function normalizeImportIdDocumentType(value: string | null | undefined): string {
  const cleaned = String(value ?? "").trim();
  if (!cleaned) return "";
  const normalized = cleaned.toLowerCase().replace(/[\s_-]+/g, "");
  if (["personalausweis", "identitycard", "ausweis", "idcard"].includes(normalized)) return "identity_card";
  if (["reisepass", "pass", "passport"].includes(normalized)) return "passport";
  if (["dienstausweis", "serviceid", "servicecard"].includes(normalized)) return "service_id";
  if (["sonstiges", "sonstige", "other"].includes(normalized)) return "other";
  return cleaned;
}

/** Applies the same public-field and format rules to every Excel import row. */
export function validateImportedPreRegistrationRows(
  rows: ImportVisitInput[],
  requiredFieldKeys: ReadonlySet<PublicFieldKey>
): string[] {
  const schema = createPublicPreRegistrationSchema(requiredFieldKeys);

  return rows.flatMap((row, index) => {
    const parsed = schema.safeParse({
      gateId: row.gateId ?? "",
      firstName: row.firstName ?? "",
      lastName: row.lastName ?? "",
      company: row.company ?? "",
      visitorStreet: row.visitorStreet ?? "",
      visitorHouseNumber: row.visitorHouseNumber ?? "",
      visitorPostalCode: row.visitorPostalCode ?? "",
      visitorCity: row.visitorCity ?? "",
      nationalityCode: findCountryCode(row.nationalityCode) ?? row.nationalityCode ?? "",
      birthDate: normalizeImportDateForValidation(row.birthDate),
      phone: row.phone ?? "",
      email: row.email ?? "",
      licensePlate: row.licensePlate ?? "",
      hostName: row.hostName ?? "",
      hostEmail: row.hostEmail ?? "",
      hostPhone: row.hostPhone ?? "",
      hostDepartment: row.hostDepartment ?? "",
      purpose: row.purpose ?? "",
      validFrom: normalizeImportDateForValidation(row.validFrom),
      validUntil: normalizeImportDateForValidation(row.validUntil),
      idDocumentType: normalizeImportIdDocumentType(row.idDocumentType),
      idDocumentValidUntil: normalizeImportDateForValidation(row.idDocumentValidUntil),
      idDocumentNumber: row.idDocumentNumber ?? "",
      notes: row.notes ?? ""
    });
    if (parsed.success) return [];

    const rowNumber = row.sourceExcelRowNumber ?? index + 1;
    return parsed.error.issues.map((issue) => `Zeile ${rowNumber}: ${issue.message}`);
  });
}
