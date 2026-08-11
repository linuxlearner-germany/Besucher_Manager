"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.publicPreRegistrationSchema = exports.PUBLIC_FIELD_INPUT_MAP = void 0;
exports.createPublicPreRegistrationSchema = createPublicPreRegistrationSchema;
exports.validateImportedPreRegistrationRows = validateImportedPreRegistrationRows;
const zod_1 = require("zod");
const countries_1 = require("./countries");
const emailPolicy_1 = require("./emailPolicy");
exports.PUBLIC_FIELD_INPUT_MAP = {
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
};
const defaultRequiredFieldKeys = new Set([
    "visitor_first_name",
    "visitor_last_name",
    "visitor_company",
    "visitor_nationality",
    "host_name",
    "host_phone",
    "visit_purpose",
    "valid_from",
    "valid_until",
]);
function createPublicPreRegistrationSchema(requiredFieldKeys = defaultRequiredFieldKeys) {
    return zod_1.z
        .object({
        gateId: zod_1.z.string().uuid().optional().or(zod_1.z.literal("")),
        firstName: zod_1.z.string().trim().max(120).optional().default(""),
        lastName: zod_1.z.string().trim().max(120).optional().default(""),
        company: zod_1.z.string().trim().max(255).optional().default(""),
        visitorStreet: zod_1.z.string().trim().max(255).optional().default(""),
        visitorHouseNumber: zod_1.z.string().trim().max(40).optional().default(""),
        visitorPostalCode: zod_1.z.string().trim().max(20).optional().default(""),
        visitorCity: zod_1.z.string().trim().max(120).optional().default(""),
        nationalityCode: zod_1.z.string().trim().optional().transform((value, context) => {
            if (!value)
                return null;
            const code = (0, countries_1.normalizeCountryCode)(value);
            if (!code) {
                context.addIssue({ code: zod_1.z.ZodIssueCode.custom, message: "Bitte eine gültige Nationalität auswählen." });
                return zod_1.z.NEVER;
            }
            return code;
        }),
        hostName: zod_1.z.string().trim().max(255).optional().default(""),
        hostEmail: emailPolicy_1.bundeswehrEmailSchema.optional().or(zod_1.z.literal("")),
        hostPhone: zod_1.z.string().trim().max(80).optional().default(""),
        hostDepartment: zod_1.z.string().trim().optional(),
        purpose: zod_1.z.string().trim().max(500).optional().default(""),
        validFrom: zod_1.z.string().trim().optional().default(""),
        validUntil: zod_1.z.string().trim().optional().default(""),
        expectedArrivalTime: zod_1.z.string().trim().regex(/^$|^([01]\d|2[0-3]):[0-5]\d$/, "Bitte eine gültige Ankunftszeit angeben.").optional().default(""),
        birthDate: zod_1.z.string().trim().optional().or(zod_1.z.literal("")),
        phone: zod_1.z.string().trim().optional(),
        email: zod_1.z.string().trim().email("Ungültige E-Mail-Adresse.").optional().or(zod_1.z.literal("")),
        licensePlate: zod_1.z.string().trim().optional(),
        idDocumentType: zod_1.z.enum(["identity_card", "passport", "service_id", "other"]).optional().or(zod_1.z.literal("")),
        idDocumentValidUntil: zod_1.z.string().trim().optional().default(""),
        idDocumentNumber: zod_1.z.string().trim().max(120).optional().default(""),
        notes: zod_1.z.string().trim().optional()
    })
        .superRefine((value, context) => {
        for (const fieldKey of requiredFieldKeys) {
            const inputKey = exports.PUBLIC_FIELD_INPUT_MAP[fieldKey];
            if (!String(value[inputKey] ?? "").trim()) {
                context.addIssue({
                    code: zod_1.z.ZodIssueCode.custom,
                    path: [inputKey],
                    message: "Dieses Pflichtfeld ist erforderlich."
                });
            }
        }
        const validFrom = new Date(value.validFrom);
        const validUntil = new Date(value.validUntil);
        if (value.validFrom && Number.isNaN(validFrom.getTime())) {
            context.addIssue({
                code: zod_1.z.ZodIssueCode.custom,
                path: ["validFrom"],
                message: "Ungültiger Startzeitpunkt."
            });
        }
        if (value.validUntil && Number.isNaN(validUntil.getTime())) {
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
        if (value.idDocumentValidUntil && Number.isNaN(idDocumentValidUntil.getTime())) {
            context.addIssue({
                code: zod_1.z.ZodIssueCode.custom,
                path: ["idDocumentValidUntil"],
                message: "Ungültiges Ablaufdatum."
            });
        }
    });
}
exports.publicPreRegistrationSchema = createPublicPreRegistrationSchema();
function normalizeImportDateForValidation(value) {
    const cleaned = String(value ?? "").trim();
    if (!cleaned)
        return "";
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
function normalizeImportIdDocumentType(value) {
    const cleaned = String(value ?? "").trim();
    if (!cleaned)
        return "";
    const normalized = cleaned.toLowerCase().replace(/[\s_-]+/g, "");
    if (["personalausweis", "identitycard", "ausweis", "idcard"].includes(normalized))
        return "identity_card";
    if (["reisepass", "pass", "passport"].includes(normalized))
        return "passport";
    if (["dienstausweis", "serviceid", "servicecard"].includes(normalized))
        return "service_id";
    if (["sonstiges", "sonstige", "other"].includes(normalized))
        return "other";
    return cleaned;
}
/** Applies the same public-field and format rules to every Excel import row. */
function validateImportedPreRegistrationRows(rows, requiredFieldKeys) {
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
            nationalityCode: (0, countries_1.findCountryCode)(row.nationalityCode) ?? row.nationalityCode ?? "",
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
        if (parsed.success)
            return [];
        const rowNumber = row.sourceExcelRowNumber ?? index + 1;
        return parsed.error.issues.map((issue) => `Zeile ${rowNumber}: ${issue.message}`);
    });
}
