import { z } from "zod";
import { normalizeCountryCode } from "./countries";

export const simplifiedSibeVisitorSchema = z.object({
  firstName: z.string().trim().min(1, "Bitte einen Vornamen angeben.").max(120),
  lastName: z.string().trim().min(1, "Bitte einen Nachnamen angeben.").max(120),
  company: z.string().trim().max(255).optional().default(""),
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
  phone: z.string().trim().max(80).optional().default(""),
  email: z.string().trim().email("Ungültige E-Mail-Adresse.").optional().or(z.literal("")),
  visitorStreet: z.string().trim().max(255).optional().default(""),
  visitorHouseNumber: z.string().trim().max(40).optional().default(""),
  visitorPostalCode: z.string().trim().max(20).optional().default(""),
  visitorCity: z.string().trim().max(120).optional().default(""),
  idDocumentType: z.enum(["identity_card", "passport", "service_id", "other"]).optional().or(z.literal("")),
  idDocumentValidUntil: z.string().trim().optional().default(""),
  idDocumentNumber: z.string().trim().max(120).optional().default("")
}).superRefine((value, context) => {
  if (value.birthDate) {
    const birthDate = new Date(value.birthDate);
    if (Number.isNaN(birthDate.getTime()) || birthDate > new Date()) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["birthDate"], message: "Bitte ein gültiges Geburtsdatum angeben." });
    }
  }

  if (value.idDocumentValidUntil && Number.isNaN(new Date(value.idDocumentValidUntil).getTime())) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["idDocumentValidUntil"], message: "Bitte ein gültiges Ablaufdatum angeben." });
  }
});

export type SimplifiedSibeVisitorInput = z.infer<typeof simplifiedSibeVisitorSchema>;
