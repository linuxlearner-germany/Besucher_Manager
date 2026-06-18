import { z } from "zod";

export const publicPreRegistrationSchema = z
  .object({
    gateId: z.string().uuid().optional().or(z.literal("")),
    firstName: z.string().trim().min(1, "Vorname ist erforderlich."),
    lastName: z.string().trim().min(1, "Nachname ist erforderlich."),
    company: z.string().trim().min(1, "Firma / Organisation ist erforderlich."),
    hostName: z.string().trim().min(1, "Ansprechpartner ist erforderlich."),
    hostEmail: z.string().trim().email("Ungueltige Ansprechpartner-E-Mail.").optional().or(z.literal("")),
    hostPhone: z.string().trim().min(1, "Ansprechpartner Telefon ist erforderlich."),
    hostDepartment: z.string().trim().optional(),
    purpose: z.string().trim().min(1, "Besuchszweck ist erforderlich."),
    validFrom: z.string().trim().min(1, "Gueltig von ist erforderlich."),
    validUntil: z.string().trim().min(1, "Gueltig bis ist erforderlich."),
    birthDate: z.string().trim().optional().or(z.literal("")),
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

    if (!Number.isNaN(validFrom.getTime()) && !Number.isNaN(validUntil.getTime()) && validUntil < validFrom) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["validUntil"],
        message: "Gueltig bis darf nicht vor Gueltig von liegen."
      });
    }

    if (value.birthDate) {
      const birthDate = new Date(value.birthDate);
      const now = new Date();

      if (Number.isNaN(birthDate.getTime())) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["birthDate"],
          message: "Ungueltiges Geburtsdatum."
        });
      } else if (birthDate > now) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["birthDate"],
          message: "Geburtsdatum darf nicht in der Zukunft liegen."
        });
      }
    }
  });

export type PublicPreRegistrationInput = z.infer<typeof publicPreRegistrationSchema>;
