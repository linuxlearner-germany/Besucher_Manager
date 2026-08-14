import { z } from "zod";
import { normalizeCountryCode } from "./countries";

const optionalText = (maximum: number) => z.string().trim().max(maximum).optional().default("");
const optionalEmail = z.string().trim().email("Ungültige E-Mail-Adresse.").optional().or(z.literal(""));

function isValidDateOnly(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export const simplifiedSibeEntrySchema = z.object({
  gateId: z.string().uuid("Bitte eine Wache auswählen."),
  validFrom: z.string().trim().refine(isValidDateOnly, "Bitte ein gültiges Startdatum angeben."),
  validUntil: z.string().trim().refine(isValidDateOnly, "Bitte ein gültiges Enddatum angeben."),
  expectedArrivalTime: z.string().trim().regex(/^$|^([01]\d|2[0-3]):[0-5]\d$/, "Bitte eine gültige Ankunftszeit angeben.").optional().default(""),
  firstName: optionalText(120),
  lastName: optionalText(120),
  company: optionalText(255),
  nationalityCode: z.string().trim().optional().default("").transform((value, context) => {
    if (!value) return null;
    const normalized = normalizeCountryCode(value);
    if (!normalized) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "Bitte eine gültige Nationalität auswählen." });
      return z.NEVER;
    }
    return normalized;
  }),
  birthDate: z.string().trim().optional().default(""),
  phone: optionalText(80),
  email: optionalEmail,
  visitorStreet: optionalText(255),
  visitorHouseNumber: optionalText(40),
  visitorPostalCode: optionalText(20),
  visitorCity: optionalText(120),
  idDocumentType: z.enum(["identity_card", "passport", "service_id", "other"]).optional().or(z.literal("")),
  idDocumentValidUntil: z.string().trim().optional().default(""),
  idDocumentNumber: optionalText(120),
  licensePlate: optionalText(40),
  hostName: optionalText(255),
  hostEmail: optionalEmail,
  hostPhone: optionalText(80),
  hostDepartment: optionalText(255),
  purpose: optionalText(500),
  notes: optionalText(4000)
}).superRefine((value, context) => {
  if (isValidDateOnly(value.validFrom) && isValidDateOnly(value.validUntil) && value.validUntil < value.validFrom) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["validUntil"],
      message: "Gültig bis darf nicht vor Gültig von liegen."
    });
  }

  if (value.birthDate) {
    if (!isValidDateOnly(value.birthDate) || value.birthDate > new Date().toISOString().slice(0, 10)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["birthDate"],
        message: "Bitte ein gültiges Geburtsdatum angeben."
      });
    }
  }

  if (value.idDocumentValidUntil && !isValidDateOnly(value.idDocumentValidUntil)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["idDocumentValidUntil"],
      message: "Bitte ein gültiges Ablaufdatum angeben."
    });
  }
});

export type SimplifiedSibeEntryInput = z.infer<typeof simplifiedSibeEntrySchema>;
