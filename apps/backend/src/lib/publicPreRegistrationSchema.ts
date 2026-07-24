import { z } from "zod";
import { normalizeCountryCode } from "./countries";

export const PUBLIC_FIELD_INPUT_MAP = {
  visitor_first_name: "firstName",
  visitor_last_name: "lastName",
  visitor_company: "company",
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
    nationalityCode: z.string().trim().transform((value, context) => {
      if (!value) return null;
      const code = normalizeCountryCode(value);
      if (!code) {
        context.addIssue({ code: z.ZodIssueCode.custom, message: "Bitte eine gültige Nationalität auswählen." });
        return z.NEVER;
      }
      return code;
    }),
    hostName: z.string().trim().max(255).optional().default(""),
    hostEmail: z.string().trim().email("Ungültige Ansprechpartner-E-Mail.").optional().or(z.literal("")),
    hostPhone: z.string().trim().max(80).optional().default(""),
    hostDepartment: z.string().trim().optional(),
    purpose: z.string().trim().max(500).optional().default(""),
    validFrom: z.string().trim().optional().default(""),
    validUntil: z.string().trim().optional().default(""),
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
