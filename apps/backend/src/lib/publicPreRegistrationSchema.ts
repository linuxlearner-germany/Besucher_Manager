import { z } from "zod";
import { findCountryCode } from "./countries";
import { ALLOWED_HOST_EMAIL_DOMAIN } from "./emailPolicy";
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

export function resolvePublicPreRegistrationValidity(
  validFrom: string | null | undefined,
  validUntil: string | null | undefined,
  now: Date = new Date()
): { validFrom: string; validUntil: string } {
  const fallbackDate = now.toISOString().slice(0, 10);
  const normalizedFrom = normalizeText(validFrom) || fallbackDate;
  return {
    validFrom: normalizedFrom,
    validUntil: normalizeText(validUntil) || normalizedFrom
  };
}

function normalizeText(value: unknown): string {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
}

function optionalText(maxLength?: number) {
  const schema = z.preprocess((value) => value ?? "", z.string()).transform(normalizeText);
  return maxLength === undefined
    ? schema
    : schema.pipe(z.string().max(maxLength));
}

function optionalEmail(message: string) {
  return z.preprocess((value) => value ?? "", z.string()).transform((value) => value.replace(/\s+/g, "").toLowerCase()).superRefine((value, context) => {
    if (!value) return;
    const parsed = z.string().email().safeParse(value);
    if (!parsed.success) {
      context.addIssue({ code: z.ZodIssueCode.custom, message });
    }
  });
}

const optionalHostEmail = optionalEmail("Ungültige E-Mail-Adresse.").superRefine((value, context) => {
  if (value && !value.endsWith(`@${ALLOWED_HOST_EMAIL_DOMAIN}`)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: `Die Anmelder-E-Mail muss auf @${ALLOWED_HOST_EMAIL_DOMAIN} enden.`
    });
  }
});

export function createPublicPreRegistrationSchema(_requiredFieldKeys: ReadonlySet<PublicFieldKey> = new Set()) {
  return z
  .object({
    gateId: optionalText().superRefine((value, context) => {
      if (value && !z.string().uuid().safeParse(value).success) {
        context.addIssue({ code: z.ZodIssueCode.custom, message: "Die ausgewählte Wache ist ungültig." });
      }
    }),
    firstName: optionalText(120),
    lastName: optionalText(120),
    company: optionalText(255),
    visitorStreet: optionalText(255),
    visitorHouseNumber: optionalText(40),
    visitorPostalCode: optionalText(20),
    visitorCity: optionalText(120),
    nationalityCode: optionalText().transform((value, context) => {
      if (!value) return null;
      const code = findCountryCode(value);
      if (!code) {
        context.addIssue({ code: z.ZodIssueCode.custom, message: "Bitte eine gültige Nationalität auswählen." });
        return z.NEVER;
      }
      return code;
    }),
    hostName: optionalText(255),
    hostEmail: optionalHostEmail,
    hostPhone: optionalText(80),
    hostDepartment: optionalText(255),
    purpose: optionalText(500),
    validFrom: optionalText(),
    validUntil: optionalText(),
    expectedArrivalTime: optionalText().superRefine((value, context) => {
      if (value && !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) {
        context.addIssue({ code: z.ZodIssueCode.custom, message: "Bitte eine gültige Ankunftszeit angeben." });
      }
    }),
    birthDate: optionalText(),
    phone: optionalText(80),
    email: optionalEmail("Ungültige E-Mail-Adresse."),
    licensePlate: optionalText(40),
    idDocumentType: z.enum(["identity_card", "passport", "service_id", "other"]).optional().or(z.literal("")).default(""),
    idDocumentValidUntil: optionalText(),
    idDocumentNumber: optionalText(120),
    notes: optionalText()
  })
  .superRefine((value, context) => {
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
