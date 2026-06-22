"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.publicPreRegistrationSchema = void 0;
const zod_1 = require("zod");
exports.publicPreRegistrationSchema = zod_1.z
    .object({
    gateId: zod_1.z.string().uuid().optional().or(zod_1.z.literal("")),
    firstName: zod_1.z.string().trim().min(1, "Vorname ist erforderlich."),
    lastName: zod_1.z.string().trim().min(1, "Nachname ist erforderlich."),
    company: zod_1.z.string().trim().min(1, "Firma / Organisation ist erforderlich."),
    hostName: zod_1.z.string().trim().min(1, "Ansprechpartner ist erforderlich."),
    hostEmail: zod_1.z.string().trim().email("Ungültige Ansprechpartner-E-Mail.").optional().or(zod_1.z.literal("")),
    hostPhone: zod_1.z.string().trim().min(1, "Ansprechpartner Telefon ist erforderlich."),
    hostDepartment: zod_1.z.string().trim().optional(),
    purpose: zod_1.z.string().trim().min(1, "Besuchszweck ist erforderlich."),
    validFrom: zod_1.z.string().trim().min(1, "Gültig von ist erforderlich."),
    validUntil: zod_1.z.string().trim().min(1, "Gültig bis ist erforderlich."),
    birthDate: zod_1.z.string().trim().optional().or(zod_1.z.literal("")),
    phone: zod_1.z.string().trim().optional(),
    email: zod_1.z.string().trim().email("Ungültige E-Mail-Adresse.").optional().or(zod_1.z.literal("")),
    licensePlate: zod_1.z.string().trim().optional(),
    idDocumentType: zod_1.z.enum(["identity_card", "passport", "other"], {
        errorMap: () => ({ message: "Ausweisart ist erforderlich." })
    }),
    idDocumentValidUntil: zod_1.z.string().trim().min(1, "Ausweis gültig bis ist erforderlich."),
    idDocumentNumber: zod_1.z.string().trim().min(1, "Ausweisnummer ist erforderlich.").max(120),
    notes: zod_1.z.string().trim().optional()
})
    .superRefine((value, context) => {
    const validFrom = new Date(value.validFrom);
    const validUntil = new Date(value.validUntil);
    if (Number.isNaN(validFrom.getTime())) {
        context.addIssue({
            code: zod_1.z.ZodIssueCode.custom,
            path: ["validFrom"],
            message: "Ungültiger Startzeitpunkt."
        });
    }
    if (Number.isNaN(validUntil.getTime())) {
        context.addIssue({
            code: zod_1.z.ZodIssueCode.custom,
            path: ["validUntil"],
            message: "Ungültiger Endzeitpunkt."
        });
    }
    if (!Number.isNaN(validFrom.getTime()) && !Number.isNaN(validUntil.getTime()) && validUntil < validFrom) {
        context.addIssue({
            code: zod_1.z.ZodIssueCode.custom,
            path: ["validUntil"],
            message: "Gültig bis darf nicht vor Gültig von liegen."
        });
    }
    if (value.birthDate) {
        const birthDate = new Date(value.birthDate);
        const now = new Date();
        if (Number.isNaN(birthDate.getTime())) {
            context.addIssue({
                code: zod_1.z.ZodIssueCode.custom,
                path: ["birthDate"],
                message: "Ungültiges Geburtsdatum."
            });
        }
        else if (birthDate > now) {
            context.addIssue({
                code: zod_1.z.ZodIssueCode.custom,
                path: ["birthDate"],
                message: "Geburtsdatum darf nicht in der Zukunft liegen."
            });
        }
    }
    const idDocumentValidUntil = new Date(value.idDocumentValidUntil);
    if (Number.isNaN(idDocumentValidUntil.getTime())) {
        context.addIssue({
            code: zod_1.z.ZodIssueCode.custom,
            path: ["idDocumentValidUntil"],
            message: "Ungültiges Ablaufdatum."
        });
    }
});
