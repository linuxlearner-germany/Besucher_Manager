import { z } from "zod";

export const publicPreRegistrationSchema = z
  .object({
    firstName: z.string().trim().min(1, "Vorname ist erforderlich."),
    lastName: z.string().trim().min(1, "Nachname ist erforderlich."),
    company: z.string().trim().min(1, "Firma / Organisation ist erforderlich."),
    hostName: z.string().trim().min(1, "Ansprechpartner ist erforderlich."),
    hostDepartment: z.string().trim().min(1, "Abteilung / Bereich ist erforderlich."),
    purpose: z.string().trim().min(1, "Besuchszweck ist erforderlich."),
    gateId: z.string().uuid("Ungueltige Wache."),
    validFrom: z.string().datetime(),
    validUntil: z.string().datetime(),
    phone: z.string().trim().optional(),
    email: z.string().trim().email("Ungueltige E-Mail-Adresse.").optional().or(z.literal("")),
    licensePlate: z.string().trim().optional(),
    notes: z.string().trim().optional()
  })
  .superRefine((value, context) => {
    const validFrom = new Date(value.validFrom);
    const validUntil = new Date(value.validUntil);

    if (Number.isNaN(validFrom.getTime())) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["validFrom"],
        message: "Ungueltiger Startzeitpunkt."
      });
    }

    if (Number.isNaN(validUntil.getTime())) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["validUntil"],
        message: "Ungueltiger Endzeitpunkt."
      });
    }

    if (!Number.isNaN(validFrom.getTime()) && !Number.isNaN(validUntil.getTime()) && validUntil <= validFrom) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["validUntil"],
        message: "Gueltig bis muss nach Gueltig von liegen."
      });
    }
  });

export type PublicPreRegistrationInput = z.infer<typeof publicPreRegistrationSchema>;
