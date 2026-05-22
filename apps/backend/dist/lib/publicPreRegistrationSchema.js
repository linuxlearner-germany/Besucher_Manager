"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.publicPreRegistrationSchema = void 0;
const zod_1 = require("zod");
exports.publicPreRegistrationSchema = zod_1.z
    .object({
    firstName: zod_1.z.string().trim().min(1, "Vorname ist erforderlich."),
    lastName: zod_1.z.string().trim().min(1, "Nachname ist erforderlich."),
    company: zod_1.z.string().trim().min(1, "Firma / Organisation ist erforderlich."),
    hostName: zod_1.z.string().trim().min(1, "Ansprechpartner ist erforderlich."),
    hostEmail: zod_1.z.string().trim().email("Ungueltige Ansprechpartner-E-Mail.").optional().or(zod_1.z.literal("")),
    hostPhone: zod_1.z.string().trim().optional(),
    hostDepartment: zod_1.z.string().trim().min(1, "Abteilung / Bereich ist erforderlich."),
    purpose: zod_1.z.string().trim().min(1, "Besuchszweck ist erforderlich."),
    gateId: zod_1.z.string().uuid("Ungueltige Wache."),
    validFrom: zod_1.z.string().trim().min(1, "Gueltig von ist erforderlich."),
    validUntil: zod_1.z.string().trim().min(1, "Gueltig bis ist erforderlich."),
    birthDate: zod_1.z.string().trim().optional().or(zod_1.z.literal("")),
    phone: zod_1.z.string().trim().optional(),
    email: zod_1.z.string().trim().email("Ungueltige E-Mail-Adresse.").optional().or(zod_1.z.literal("")),
    licensePlate: zod_1.z.string().trim().optional(),
    notes: zod_1.z.string().trim().optional()
})
    .superRefine((value, context) => {
    const validFrom = new Date(value.validFrom);
    const validUntil = new Date(value.validUntil);
    if (Number.isNaN(validFrom.getTime())) {
        context.addIssue({
            code: zod_1.z.ZodIssueCode.custom,
            path: ["validFrom"],
            message: "Ungueltiger Startzeitpunkt."
        });
    }
    if (Number.isNaN(validUntil.getTime())) {
        context.addIssue({
            code: zod_1.z.ZodIssueCode.custom,
            path: ["validUntil"],
            message: "Ungueltiger Endzeitpunkt."
        });
    }
    if (!Number.isNaN(validFrom.getTime()) && !Number.isNaN(validUntil.getTime()) && validUntil <= validFrom) {
        context.addIssue({
            code: zod_1.z.ZodIssueCode.custom,
            path: ["validUntil"],
            message: "Gueltig bis muss nach Gueltig von liegen."
        });
    }
    if (value.birthDate) {
        const birthDate = new Date(value.birthDate);
        const now = new Date();
        if (Number.isNaN(birthDate.getTime())) {
            context.addIssue({
                code: zod_1.z.ZodIssueCode.custom,
                path: ["birthDate"],
                message: "Ungueltiges Geburtsdatum."
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
});
