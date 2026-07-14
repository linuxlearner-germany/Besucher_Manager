import sql from "mssql";
import { Router } from "express";
import { z } from "zod";
import {
  canUseGuardVisitorSearch,
  checkInVisit,
  checkOutVisit,
  createWalkInVisit,
  getCalendarVisitsForUser,
  getTodayVisitsForUser,
  getVisitDetailForUser,
  hasGuardVisitorSearchCriteria,
  searchVisitorsForGuard,
  updateHostSignatureForGuard,
  updateVisitForGuard
} from "../lib/guardVisits";
import { writeAuditLog } from "../lib/auditLog";
import { getPool } from "../lib/db";
import { HOST_SIGNATURE_STATUS, VISIT_STATUS } from "../lib/visitWorkflow";
import {
  getRequestIp,
  getRequestUserAgent,
  handleUnexpectedError,
  requirePermission,
  requireRole,
  sendError,
  sendForbidden,
  sendValidationError
} from "./shared";

const hostSignatureStatusSchema = z.enum([
  HOST_SIGNATURE_STATUS.NOT_REQUIRED,
  HOST_SIGNATURE_STATUS.PENDING,
  HOST_SIGNATURE_STATUS.SIGNED_SAME_DAY,
  HOST_SIGNATURE_STATUS.SIGNED_LATER,
  HOST_SIGNATURE_STATUS.MISSING_EXCEPTION
]);
const checkOutSchema = z.object({
  signed_by_host_confirmed: z.literal(true, {
    errorMap: () => ({ message: "Bitte bestätigen Sie die Ansprechpartner-Bestätigung vor dem Check-out." })
  }),
  returned_badge_number: z.string().trim().min(1, "Bitte geben Sie die Besuchsnummer vom Besucherschein ein.").transform((value) => value.toUpperCase())
});
const signatureUpdateSchema = z.object({
  host_signature_status: hostSignatureStatusSchema,
  host_signature_date: z.string().trim().optional(),
  host_signature_note: z.string().trim().optional()
}).superRefine((value, context) => {
  if (value.host_signature_status === HOST_SIGNATURE_STATUS.SIGNED_LATER && !value.host_signature_date?.trim()) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["host_signature_date"],
      message: "Bitte geben Sie das Datum der Unterschrift an."
    });
  }

  if (value.host_signature_status === HOST_SIGNATURE_STATUS.MISSING_EXCEPTION && !value.host_signature_note?.trim()) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["host_signature_note"],
      message: "Bitte dokumentieren Sie die Ausnahme."
    });
  }
});
const guardVisitUpdateSchema = z.object({
  firstName: z.string().trim().min(1).max(120),
  lastName: z.string().trim().min(1).max(120),
  birthDate: z.string().trim().optional().or(z.literal("")),
  company: z.string().trim().min(1).max(255),
  phone: z.string().trim().optional().or(z.literal("")),
  email: z.string().trim().email("Ungueltige E-Mail-Adresse.").optional().or(z.literal("")),
  licensePlate: z.string().trim().max(40).optional().or(z.literal("")),
  hostName: z.string().trim().min(1).max(255),
  hostEmail: z.string().trim().email("Ungueltige Ansprechpartner-E-Mail.").optional().or(z.literal("")),
  hostPhone: z.string().trim().max(80).optional().or(z.literal("")),
  hostDepartment: z.string().trim().max(255).optional().or(z.literal("")),
  purpose: z.string().trim().min(1).max(500),
  gateId: z.string().uuid().optional().or(z.literal("")),
  validFrom: z.string().trim().min(1, "Gültig von ist erforderlich."),
  validUntil: z.string().trim().min(1, "Gültig bis ist erforderlich."),
  notes: z.string().trim().optional().or(z.literal("")),
  visitorStreet: z.string().trim().max(255).optional().or(z.literal("")),
  visitorHouseNumber: z.string().trim().max(40).optional().or(z.literal("")),
  visitorPostalCode: z.string().trim().max(20).optional().or(z.literal("")),
  visitorCity: z.string().trim().max(120).optional().or(z.literal("")),
  visitorAddress: z.string().trim().max(500).optional().or(z.literal("")),
  idDocumentType: z.enum(["identity_card", "passport", "other"]).optional().or(z.literal("")),
  idDocumentValidUntil: z.string().trim().optional().or(z.literal("")),
  idDocumentNumber: z.string().trim().max(120).optional().or(z.literal("")),
  idDocumentIssuingPlace: z.string().trim().max(255).optional().or(z.literal("")),
  visitPurposeType: z.enum(["private", "business"]).optional().or(z.literal("")),
  visitCompanyOrder: z.string().trim().max(500).optional().or(z.literal("")),
  hostUnit: z.string().trim().max(255).optional().or(z.literal("")),
  hostBuilding: z.string().trim().max(120).optional().or(z.literal("")),
  hostRoom: z.string().trim().max(80).optional().or(z.literal("")),
  hostExtension: z.string().trim().max(80).optional().or(z.literal("")),
  visitEndType: z.enum(["ended", "forwarded"]).optional().or(z.literal("")),
  forwardedToNote: z.string().trim().max(500).optional().or(z.literal("")),
  devicePhotoApp: z.boolean().optional(),
  deviceFilmApp: z.boolean().optional(),
  deviceVideoCamera: z.boolean().optional(),
  deviceManufacturer: z.string().trim().max(255).optional().or(z.literal("")),
  deviceSerialNumber: z.string().trim().max(120).optional().or(z.literal("")),
  deviceAccessories: z.string().trim().max(500).optional().or(z.literal("")),
  deviceDepositNote: z.string().trim().max(500).optional().or(z.literal("")),
  deviceReturnConfirmed: z.boolean().optional(),
  deviceReturnedAt: z.string().trim().optional().or(z.literal(""))
}).superRefine((value, context) => {
  const validFrom = new Date(value.validFrom);
  const validUntil = new Date(value.validUntil);
  if (!Number.isNaN(validFrom.getTime()) && !Number.isNaN(validUntil.getTime()) && validUntil < validFrom) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["validUntil"],
      message: "Gültig bis darf nicht vor Gültig von liegen."
    });
  }
  if (value.birthDate) {
    const birthDate = new Date(value.birthDate);
    if (Number.isNaN(birthDate.getTime())) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["birthDate"],
        message: "Ungueltiges Geburtsdatum."
      });
    } else if (birthDate > new Date()) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["birthDate"],
        message: "Geburtsdatum darf nicht in der Zukunft liegen."
      });
    }
  }

  if (value.idDocumentValidUntil) {
    const date = new Date(value.idDocumentValidUntil);
    if (Number.isNaN(date.getTime())) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["idDocumentValidUntil"],
        message: "Ungueltiges Ausweisdatum."
      });
    }
  }

  if (value.deviceReturnedAt) {
    const date = new Date(value.deviceReturnedAt);
    if (Number.isNaN(date.getTime())) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["deviceReturnedAt"],
        message: "Ungueltiges Rueckgabe-Datum."
      });
    }
  }
});
const gateCreateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500).optional().or(z.literal("")),
  location: z.string().trim().min(1).max(255),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(9999).optional()
});
const gateUpdateSchema = gateCreateSchema.partial();
const userCreateSchema = z.object({
  username: z.string().trim().min(1).max(120),
  displayName: z.string().trim().max(255).optional().or(z.literal("")),
  password: z.string().min(8).max(128),
  role: z.enum(["admin", "guard", "sibe"]),
  gateId: z.string().uuid().nullable().optional(),
  isActive: z.boolean().optional()
}).superRefine((value, context) => {
  if (value.role === "guard" && !value.gateId) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["gateId"],
      message: "Fuer Guard-Benutzer ist eine Wache erforderlich."
    });
  }
});
const userUpdateSchema = z.object({
  username: z.string().trim().min(1).max(120).optional(),
  displayName: z.string().trim().max(255).optional().or(z.literal("")),
  password: z.string().min(8).max(128).optional(),
  role: z.enum(["admin", "guard", "sibe"]).optional(),
  gateId: z.string().uuid().nullable().optional(),
  isActive: z.boolean().optional()
});
const visitCancelSchema = z.object({
  cancel_reason: z.string().trim().min(1).max(500)
});
const guardCalendarQuerySchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  status: z.string().optional(),
  search: z.string().optional()
}).superRefine((value, context) => {
  const from = new Date(`${value.from}T00:00:00.000Z`);
  const to = new Date(`${value.to}T00:00:00.000Z`);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["from"], message: "Ungueltiger Datumsbereich." });
    return;
  }
  if (to < from) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["to"], message: "Bis-Datum muss nach Von-Datum liegen." });
  }
  const diffDays = Math.floor((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays > 90) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["to"], message: "Datumsbereich darf maximal 90 Tage umfassen." });
  }
});
const guardWalkInCreateSchema = z.object({
  clientRequestId: z.string().trim().min(8).max(64).optional().or(z.literal("")),
  existingVisitorId: z.string().uuid().optional().or(z.literal("")),
  action: z.enum(["save", "check_in", "check_in_and_print"]).optional(),
  firstName: z.string().trim().min(1).max(120),
  lastName: z.string().trim().min(1).max(120),
  company: z.string().trim().min(1).max(255),
  birthDate: z.string().trim().optional().or(z.literal("")),
  phone: z.string().trim().optional().or(z.literal("")),
  email: z.string().trim().email("Ungueltige E-Mail-Adresse.").optional().or(z.literal("")),
  licensePlate: z.string().trim().max(40).optional().or(z.literal("")),
  hostName: z.string().trim().min(1).max(255),
  hostEmail: z.string().trim().email("Ungueltige Ansprechpartner-E-Mail.").optional().or(z.literal("")),
  hostPhone: z.string().trim().min(1).max(80),
  hostDepartment: z.string().trim().max(255).optional().or(z.literal("")),
  purpose: z.string().trim().min(1).max(500),
  validFrom: z.string().trim().min(1),
  validUntil: z.string().trim().min(1),
  notes: z.string().trim().optional().or(z.literal("")),
  visitorStreet: z.string().trim().min(1).max(255),
  visitorHouseNumber: z.string().trim().min(1).max(40),
  visitorPostalCode: z.string().trim().min(1).max(20),
  visitorCity: z.string().trim().min(1).max(120),
  idDocumentType: z.enum(["identity_card", "passport", "other"]),
  idDocumentValidUntil: z.string().trim().min(1),
  idDocumentNumber: z.string().trim().min(1).max(120),
  devicePhotoApp: z.boolean().optional(),
  deviceFilmApp: z.boolean().optional(),
  deviceVideoCamera: z.boolean().optional(),
  deviceManufacturer: z.string().trim().max(255).optional().or(z.literal("")),
  deviceSerialNumber: z.string().trim().max(120).optional().or(z.literal("")),
  deviceAccessories: z.string().trim().max(500).optional().or(z.literal("")),
  deviceDepositNote: z.string().trim().max(500).optional().or(z.literal(""))
}).superRefine((value, context) => {
  const validFrom = new Date(value.validFrom);
  const validUntil = new Date(value.validUntil);
  if (!Number.isNaN(validFrom.getTime()) && !Number.isNaN(validUntil.getTime()) && validUntil < validFrom) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["validUntil"],
      message: "Gültig bis darf nicht vor Gültig von liegen."
    });
  }
});

const guardVisitorSearchSchema = z.object({
  query: z.string().trim().max(255).optional().or(z.literal("")),
  firstName: z.string().trim().max(120).optional().or(z.literal("")),
  lastName: z.string().trim().max(120).optional().or(z.literal("")),
  company: z.string().trim().max(255).optional().or(z.literal("")),
  birthDate: z.string().trim().optional().or(z.literal("")),
  city: z.string().trim().max(120).optional().or(z.literal("")),
  phone: z.string().trim().max(80).optional().or(z.literal("")),
  email: z.string().trim().max(255).optional().or(z.literal("")),
  licensePlate: z.string().trim().max(40).optional().or(z.literal("")),
  badgeNumber: z.string().trim().max(64).optional().or(z.literal("")),
  page: z.coerce.number().int().min(1).max(100).optional(),
  limit: z.coerce.number().int().min(1).max(20).optional()
});

export const guardRouter = Router();

guardRouter.get("/api/guard/visitors/search", async (request, response) => {
  const user = await requirePermission(request, response, "visits.create");
  if (!user) {
    return;
  }

  if (!canUseGuardVisitorSearch(user)) {
    return sendForbidden(response);
  }

  const parsed = guardVisitorSearchSchema.safeParse(request.query);
  if (!parsed.success) {
    return sendValidationError(response, parsed.error.flatten());
  }

  if (!hasGuardVisitorSearchCriteria(parsed.data)) {
    return response.json({ visitors: [], page: parsed.data.page ?? 1, limit: parsed.data.limit ?? 8 });
  }

  try {
    const payload = await searchVisitorsForGuard(user, parsed.data);

    await writeAuditLog({
      user: user.username,
      userId: user.id,
      action: "guard_visitor_search",
      objectType: "visitor",
      objectId: "search",
      ipAddress: getRequestIp(request),
      userAgent: getRequestUserAgent(request),
      metadata: {
        gateId: user.gateId,
        resultCount: payload.visitors.length
      }
    });

    return response.json(payload);
  } catch (error) {
    if (error instanceof Error && error.message === "guard_visitor_search_forbidden") {
      return sendForbidden(response);
    }
    return handleUnexpectedError(response, error, "DATABASE_ERROR", "Die Besuchersuche konnte nicht ausgeführt werden.");
  }
});

guardRouter.post("/api/guard/visits/walk-in", async (request, response) => {
  const user = await requirePermission(request, response, "visits.create");
  if (!user) {
    return;
  }

  if (user.role !== "guard" && user.role !== "admin") {
    return sendForbidden(response);
  }

  const parsed = guardWalkInCreateSchema.safeParse(request.body);
  if (!parsed.success) {
    return sendValidationError(response, parsed.error.flatten());
  }

  try {
    const created = await createWalkInVisit(
      user,
      parsed.data,
      getRequestIp(request),
      getRequestUserAgent(request)
    );
    return response.status(201).json({
      success: true,
      message: parsed.data.action === "save"
        ? "Besuch wurde gespeichert."
        : "Spontanbesucher wurde angelegt und eingecheckt.",
      visitId: created.visitId,
      visitorId: created.visitorId,
      badgeNumber: created.badgeNumber,
      status: created.status,
      alreadyExisted: Boolean(created.alreadyExisted)
    });
  } catch (error) {
    if (error instanceof Error && error.message === "visit_gate_required_for_checkin") {
      return sendError(
        response,
        400,
        "VALIDATION_ERROR",
        "Für diese Anmeldung ist zuerst eine aktive Wache erforderlich."
      );
    }
    if (error instanceof Error && error.message === "existing_visitor_not_found") {
      return sendError(response, 404, "NOT_FOUND", "Der ausgewählte Besucher wurde nicht gefunden.");
    }
    return handleUnexpectedError(response, error, "DATABASE_ERROR", "Der Spontanbesucher konnte nicht angelegt werden.");
  }
});

guardRouter.get("/api/guard/visits/today", async (request, response) => {
  const user = await requirePermission(request, response, "visits.read");

  if (!user) {
    return;
  }

  try {
    const visits = await getTodayVisitsForUser(user, {
      search: typeof request.query.search === "string" ? request.query.search : undefined,
      status: typeof request.query.status === "string" ? request.query.status : undefined,
      signatureStatus: typeof request.query.signatureStatus === "string" ? request.query.signatureStatus : undefined
    });

    return response.json({ visits });
  } catch (error) {
    return handleUnexpectedError(response, error, "DATABASE_ERROR", "Die Tagesuebersicht konnte nicht geladen werden.");
  }
});

guardRouter.get("/api/guard/visits/calendar", async (request, response) => {
  const user = await requirePermission(request, response, "visits.read");
  if (!user) return;

  const parsed = guardCalendarQuerySchema.safeParse({
    from: request.query.from,
    to: request.query.to,
    status: typeof request.query.status === "string" ? request.query.status : undefined,
    search: typeof request.query.search === "string" ? request.query.search : undefined
  });
  if (!parsed.success) {
    return sendValidationError(response, parsed.error.flatten());
  }

  try {
    const from = `${parsed.data.from}T00:00:00.000Z`;
    const toExclusiveDate = new Date(`${parsed.data.to}T00:00:00.000Z`);
    toExclusiveDate.setUTCDate(toExclusiveDate.getUTCDate() + 1);
    const visits = await getCalendarVisitsForUser(user, {
      from,
      to: toExclusiveDate.toISOString(),
      status: parsed.data.status,
      search: parsed.data.search
    });
    return response.json({ items: visits });
  } catch (error) {
    return handleUnexpectedError(response, error, "DATABASE_ERROR", "Die Kalenderansicht konnte nicht geladen werden.");
  }
});

guardRouter.get("/api/guard/visits/:id", async (request, response) => {
  const user = await requirePermission(request, response, "visits.read");

  if (!user) {
    return;
  }

  try {
    const visit = await getVisitDetailForUser(user, request.params.id);

    if (!visit) {
      return response.status(404).json({
        error: "NOT_FOUND",
        message: "Der Besuch wurde nicht gefunden."
      });
    }

    return response.json({ visit });
  } catch (error) {
    return handleUnexpectedError(response, error, "DATABASE_ERROR", "Die Besuchsdaten konnten nicht geladen werden.");
  }
});

guardRouter.post("/api/guard/visits/:id/check-in", async (request, response) => {
  const user = await requirePermission(request, response, "visits.checkIn");

  if (!user) {
    return;
  }

  try {
    await checkInVisit(user, request.params.id, getRequestIp(request), getRequestUserAgent(request));
    return response.json({
      success: true,
      status: VISIT_STATUS.CHECKED_IN
    });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "visit_not_found") {
        return sendError(response, 404, "NOT_FOUND", "Der Besuch wurde nicht gefunden.");
      }

      if (error.message === "visit_scope_forbidden") {
        return sendForbidden(response);
      }

      if (error.message === "invalid_check_in_status") {
        return sendError(response, 409, "INVALID_STATUS_TRANSITION", "Der Besuch kann in diesem Status nicht eingecheckt werden.");
      }

      if (error.message === "visit_required_fields_missing") {
        return sendError(
          response,
          400,
          "VALIDATION_ERROR",
          "Vor dem Check-in muessen fehlende Pflichtdaten ergaenzt werden.",
          (error as Error & { details?: unknown }).details
        );
      }

      if (error.message === "visit_gate_required_for_checkin") {
        return sendError(
          response,
          400,
          "VALIDATION_ERROR",
          "Vor dem Check-in muss eine Wache zugeordnet werden."
        );
      }

      if (error.message === "visit_approval_pending") {
        return sendError(
          response,
          409,
          "VISIT_APPROVAL_PENDING",
          "Der Besuch ist noch nicht durch SiBe freigegeben."
        );
      }

      if (error.message === "visit_approval_rejected") {
        return sendError(
          response,
          409,
          "VISIT_APPROVAL_REJECTED",
          "Der Besuch wurde durch SiBe abgelehnt."
        );
      }

    }

    return handleUnexpectedError(response, error, "DATABASE_ERROR", "Der Check-in konnte nicht gespeichert werden.");
  }
});

guardRouter.put("/api/guard/visits/:id", async (request, response) => {
  const user = await requirePermission(request, response, "visits.update");

  if (!user) {
    return;
  }

  const result = guardVisitUpdateSchema.safeParse(request.body);
  if (!result.success) {
    return sendValidationError(response, result.error.flatten());
  }

  try {
    await updateVisitForGuard(user, request.params.id, result.data, getRequestIp(request), getRequestUserAgent(request));
    return response.json({ success: true });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "visit_not_found") {
        return sendError(response, 404, "NOT_FOUND", "Der Besuch wurde nicht gefunden.");
      }

      if (error.message === "visit_scope_forbidden") {
        return sendForbidden(response);
      }

      if (error.message === "visit_update_status_forbidden") {
        return sendError(response, 409, "INVALID_STATUS_TRANSITION", "Der Besuch kann in diesem Status nicht mehr bearbeitet werden.");
      }
    }

    return handleUnexpectedError(response, error, "DATABASE_ERROR", "Die Besuchsdaten konnten nicht gespeichert werden.");
  }
});

guardRouter.post("/api/guard/visits/:id/check-out", async (request, response) => {
  const user = await requirePermission(request, response, "visits.checkOut");

  if (!user) {
    return;
  }

  const result = checkOutSchema.safeParse(request.body);

  if (!result.success) {
    return sendValidationError(response, result.error.flatten());
  }

  try {
    await checkOutVisit(
      user,
      request.params.id,
      result.data.returned_badge_number,
      {
        status: HOST_SIGNATURE_STATUS.SIGNED_SAME_DAY
      },
      undefined,
      getRequestIp(request),
      getRequestUserAgent(request)
    );

    return response.json({
      success: true,
      status: VISIT_STATUS.CHECKED_OUT
    });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "visit_not_found") {
        return sendError(response, 404, "NOT_FOUND", "Der Besuch wurde nicht gefunden.");
      }

      if (error.message === "visit_scope_forbidden") {
        return sendForbidden(response);
      }

      if (error.message === "returned_badge_number_mismatch") {
        return sendError(response, 400, "VALIDATION_ERROR", "Die eingegebene Besuchsnummer stimmt nicht mit diesem Besuch ueberein.");
      }

      if (error.message === "invalid_check_out_status") {
        return sendError(response, 409, "INVALID_STATUS_TRANSITION", "Der Besuch kann in diesem Status nicht ausgecheckt werden.");
      }

      if (error.message === "host_signature_checkout_required" || error.message === "host_signature_required") {
        return sendError(response, 409, "HOST_CONFIRMATION_REQUIRED", "Ohne Ansprechpartner-Bestätigung darf der Besuch nicht vom Gelände gelassen werden.");
      }
    }

    return handleUnexpectedError(response, error, "DATABASE_ERROR", "Der Check-out konnte nicht gespeichert werden.");
  }
});

guardRouter.put("/api/guard/visits/:id/signature", async (request, response) => {
  const user = await requirePermission(request, response, "visits.update");

  if (!user) {
    return;
  }

  const result = signatureUpdateSchema.safeParse(request.body);

  if (!result.success) {
    return sendValidationError(response, result.error.flatten());
  }

  try {
    await updateHostSignatureForGuard(
      user,
      request.params.id,
      {
        status: result.data.host_signature_status,
        signatureDate: result.data.host_signature_date,
        note: result.data.host_signature_note
      },
      getRequestIp(request),
      getRequestUserAgent(request)
    );

    return response.json({ success: true });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "visit_not_found") {
        return sendError(response, 404, "NOT_FOUND", "Der Besuch wurde nicht gefunden.");
      }

      if (error.message === "visit_scope_forbidden") {
        return sendForbidden(response);
      }

      if (error.message === "host_signature_date_required") {
        return sendError(response, 400, "VALIDATION_ERROR", "Bitte geben Sie das Datum der Unterschrift an.");
      }

      if (error.message === "host_signature_note_required") {
        return sendError(response, 400, "VALIDATION_ERROR", "Bitte dokumentieren Sie die Ausnahme.");
      }

      if (error.message === "host_signature_date_before_visit") {
        return sendError(response, 400, "VALIDATION_ERROR", "Das Datum der Unterschrift darf nicht vor dem Besuchsbeginn liegen.");
      }

      if (error.message === "invalid_signature_update_status") {
        return sendError(response, 409, "INVALID_STATUS_TRANSITION", "Der Unterschriftsstatus kann erst waehrend oder nach dem laufenden Besuch erfasst werden.");
      }
    }

    return handleUnexpectedError(response, error, "DATABASE_ERROR", "Der Unterschriftsstatus konnte nicht gespeichert werden.");
  }
});

guardRouter.post("/api/guard/visits/:id/print-log", async (request, response) => {
  const user = await requirePermission(request, response, "visits.printBadge");

  if (!user) {
    return;
  }

  const isReprint = typeof request.body?.reprint === "boolean" ? request.body.reprint : false;

  await writeAuditLog({
    user: user.username,
    userId: user.id,
    action: "VISIT_BADGE_PRINTED",
    objectType: "visit",
    objectId: request.params.id,
    ipAddress: getRequestIp(request),
    userAgent: getRequestUserAgent(request)
  });

  await writeAuditLog({
    user: user.username,
    userId: user.id,
    action: isReprint ? "guard_visitor_pass_reprinted" : "guard_visitor_pass_printed",
    objectType: "visit",
    objectId: request.params.id,
    ipAddress: getRequestIp(request),
    userAgent: getRequestUserAgent(request)
  });

  return response.json({ success: true });
});

guardRouter.post("/api/guard/visits/:id/cancel", async (request, response) => {
  const user = await requirePermission(request, response, "visits.delete");
  if (!user) return;

  const parsed = visitCancelSchema.safeParse(request.body);
  if (!parsed.success) return sendValidationError(response, parsed.error.flatten());

  try {
    const pool = await getPool();
    const visitResult = await pool.request()
      .input("id", sql.UniqueIdentifier, request.params.id)
      .query<{ gateId: string; status: string }>("SELECT gate_id AS gateId, status FROM dbo.visits WHERE id = @id");

    const visit = visitResult.recordset[0];
    if (!visit) {
      return sendError(response, 404, "NOT_FOUND", "Der Besuch wurde nicht gefunden.");
    }

    if (user.role === "guard" && user.gateId !== visit.gateId) {
      return sendForbidden(response);
    }

    await pool.request()
      .input("id", sql.UniqueIdentifier, request.params.id)
      .input("cancelledBy", sql.UniqueIdentifier, user.id)
      .input("cancelReason", sql.NVarChar(500), parsed.data.cancel_reason)
      .query(`
        UPDATE dbo.visits
        SET
          status = '${VISIT_STATUS.CANCELLED}',
          cancelled_at = SYSUTCDATETIME(),
          cancelled_by = @cancelledBy,
          cancel_reason = @cancelReason,
          updated_at = SYSUTCDATETIME()
        WHERE id = @id
      `);

    await writeAuditLog({
      user: user.username,
      userId: user.id,
      action: "VISIT_CANCELLED",
      objectType: "visit",
      objectId: request.params.id,
      ipAddress: getRequestIp(request)
    });

    return response.json({ success: true, status: VISIT_STATUS.CANCELLED });
  } catch (error) {
    return handleUnexpectedError(response, error, "DATABASE_ERROR", "Der Besuch konnte nicht storniert werden.");
  }
});
