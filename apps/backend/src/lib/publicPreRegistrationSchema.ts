import { z } from "zod";

export const publicPreRegistrationSchema = z
  .object({
    gateId: z.string().uuid().optional().or(z.literal("")),
    firstName: z.string().trim().min(1, "Vorname ist erforderlich."),
    lastName: z.string().trim().min(1, "Nachname ist erforderlich."),
    company: z.string().trim().min(1, "Firma / Organisation ist erforderlich."),
    hostName: z.string().trim().min(1, "Ansprechpartner ist erforderlich."),
    hostEmail: z.string().trim().email("Ungültige Ansprechpartner-E-Mail.").optional().or(z.literal("")),
    hostPhone: z.string().trim().min(1, "Ansprechpartner Telefon ist erforderlich."),
    hostDepartment: z.string().trim().optional(),
    purpose: z.string().trim().min(1, "Besuchszweck ist erforderlich."),
    validFrom: z.string().trim().min(1, "Gültig von ist erforderlich."),
    validUntil: z.string().trim().min(1, "Gültig bis ist erforderlich."),
    birthDate: z.string().trim().optional().or(z.literal("")),
    phone: z.string().trim().optional(),
    email: z.string().trim().email("Ungültige E-Mail-Adresse.").optional().or(z.literal("")),
    licensePlate: z.string().trim().optional(),
    idDocumentType: z.enum(["identity_card", "passport", "other"], {
      errorMap: () => ({ message: "Ausweisart ist erforderlich." })
    }),
    idDocumentValidUntil: z.string().trim().min(1, "Ausweis gültig bis ist erforderlich."),
    idDocumentNumber: z.string().trim().min(1, "Ausweisnummer ist erforderlich.").max(120),
    notes: z.string().trim().optional()
  })
  .superRefine((value, context) => {
    const validFrom = new Date(value.validFrom);
    const validUntil = new Date(value.validUntil);

    if (Number.isNaN(validFrom.getTime())) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["validFrom"],
        message: "Ungültiger Startzeitpunkt."
      });
    }

    if (Number.isNaN(validUntil.getTime())) {
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
    if (Number.isNaN(idDocumentValidUntil.getTime())) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["idDocumentValidUntil"],
        message: "Ungültiges Ablaufdatum."
      });
    }
  });

export type PublicPreRegistrationInput = z.infer<typeof publicPreRegistrationSchema>;
