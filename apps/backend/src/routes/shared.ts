import crypto from "node:crypto";
import sql from "mssql";
import type { Request, Response } from "express";
import { env } from "../config/env";
import { clearSessionCookie, getSessionCookieName, readSessionToken } from "../lib/authSession";
import { writeErrorLog } from "../lib/errorLogs";
import { findActiveGateById } from "../lib/publicPreRegistrations";
import { findUserById } from "../lib/users";
import { hasPermission, type AppPermission, type AuthenticatedUser } from "../lib/visitWorkflow";

export const csrfCookieName = "visitor_manager_csrf";

export function isSchemaMissingError(error: unknown): boolean {
  return error instanceof Error && error.message.includes("Invalid object name");
}

export function issueCsrfToken(response: Response, currentToken?: string): string {
  const token = currentToken || crypto.randomUUID();

  response.cookie(csrfCookieName, token, {
    signed: true,
    sameSite: "strict",
    secure: env.APP_SECURE_COOKIES,
    httpOnly: true
  });

  return token;
}

export function getRequestIp(request: Request): string {
  return request.ip || request.socket.remoteAddress || "unknown";
}

export function getRequestUserAgent(request: Request): string | null {
  return request.get("user-agent") || null;
}

export function sendError(
  response: Response,
  status: number,
  error: string,
  message: string,
  details?: unknown
) {
  return response.status(status).json({
    error,
    message,
    ...(details !== undefined ? { details } : {})
  });
}

export function sendValidationError(response: Response, details?: unknown) {
  return sendError(response, 400, "VALIDATION_ERROR", "Bitte pruefen Sie die eingegebenen Daten.", details);
}

export function sendForbidden(response: Response) {
  return sendError(response, 403, "FORBIDDEN", "Nicht ausreichend berechtigt.");
}

export function sendAuthRequired(response: Response) {
  return sendError(response, 401, "UNAUTHORIZED", "Anmeldung erforderlich.");
}

export function handleUnexpectedError(
  response: Response,
  error: unknown,
  fallbackErrorCode: string,
  fallbackMessage: string
) {
  console.error(error);
  const request = response.req;
  const userName = request?.auth?.username
    || (typeof request?.body?.username === "string" ? request.body.username : null)
    || null;
  const errorMessage = error instanceof Error ? error.message : fallbackMessage;
  const stackTrace = error instanceof Error ? error.stack ?? null : null;
  const metadataJson = JSON.stringify({
    fallbackMessage,
    originalType: error instanceof Error ? error.name : typeof error
  });

  void writeErrorLog({
    errorCode: fallbackErrorCode,
    message: errorMessage,
    requestPath: request?.originalUrl ?? request?.url ?? null,
    requestMethod: request?.method ?? null,
    ipAddress: request ? getRequestIp(request) : null,
    userAgent: request ? getRequestUserAgent(request) : null,
    userName,
    stackTrace,
    metadataJson
  }).catch((loggingError) => {
    console.error("error log write failed", loggingError);
  });

  return sendError(response, 500, fallbackErrorCode, fallbackMessage);
}

export function buildFieldKeyFromLabel(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_{2,}/g, "_")
    .slice(0, 100);
}

export function normalizeImportOptions(options: unknown): string | null {
  if (options === null || options === undefined) {
    return null;
  }
  if (Array.isArray(options)) {
    return JSON.stringify(options);
  }
  if (typeof options === "string") {
    const value = options.trim();
    return value || null;
  }
  if (typeof options === "object") {
    return JSON.stringify(options);
  }
  return null;
}

export async function resolveAuthenticatedUser(request: Request): Promise<AuthenticatedUser | null> {
  if (request.auth !== undefined) {
    return request.auth;
  }

  const token = request.cookies?.[getSessionCookieName()];
  const sessionUser = readSessionToken(token);

  if (!sessionUser) {
    request.auth = null;
    return null;
  }

  const currentUser = await findUserById(sessionUser.id);
  if (!currentUser) {
    request.auth = null;
    return null;
  }

  const activeGateId = currentUser.role === "guard" ? sessionUser.gateId : currentUser.gateId;
  const activeGate = activeGateId ? await findActiveGateById(activeGateId) : null;
  const resolvedUser: AuthenticatedUser = {
    ...currentUser,
    gateId: activeGate?.id ?? null,
    gateName: activeGate?.name ?? null
  };

  request.auth = resolvedUser;
  return resolvedUser;
}

export async function requireAuthenticatedUser(request: Request, response: Response): Promise<AuthenticatedUser | null> {
  const user = await resolveAuthenticatedUser(request);

  if (!user) {
    sendAuthRequired(response);
    return null;
  }

  return user;
}

export async function requireRole(
  request: Request,
  response: Response,
  allowedRoles: Array<AuthenticatedUser["role"]>
): Promise<AuthenticatedUser | null> {
  const user = await requireAuthenticatedUser(request, response);

  if (!user) {
    return null;
  }

  if (!allowedRoles.includes(user.role)) {
    sendForbidden(response);
    return null;
  }

  return user;
}

export async function requirePermission(
  request: Request,
  response: Response,
  permission: AppPermission
): Promise<AuthenticatedUser | null> {
  const user = await requireAuthenticatedUser(request, response);

  if (!user) {
    return null;
  }

  if (!hasPermission(user, permission)) {
    sendForbidden(response);
    return null;
  }

  return user;
}

export async function requireAnyPermission(
  request: Request,
  response: Response,
  permissions: AppPermission[]
): Promise<AuthenticatedUser | null> {
  const user = await requireAuthenticatedUser(request, response);

  if (!user) {
    return null;
  }

  if (!permissions.some((permission) => hasPermission(user, permission))) {
    sendForbidden(response);
    return null;
  }

  return user;
}

export async function countUserReferences(pool: sql.ConnectionPool, userId: string) {
  const checks = [
    { label: "Besuche erstellt", query: "SELECT COUNT(*) AS count FROM dbo.visits WHERE created_by = @id" },
    { label: "Besuche eingecheckt", query: "SELECT COUNT(*) AS count FROM dbo.visits WHERE check_in_by = @id" },
    { label: "Besuche ausgecheckt", query: "SELECT COUNT(*) AS count FROM dbo.visits WHERE check_out_by = @id" },
    { label: "Besuche storniert", query: "SELECT COUNT(*) AS count FROM dbo.visits WHERE cancelled_by = @id" },
    { label: "Unterschriften bestaetigt", query: "SELECT COUNT(*) AS count FROM dbo.visits WHERE host_signature_confirmed_by = @id" },
    { label: "Besuchsnummern geprueft", query: "SELECT COUNT(*) AS count FROM dbo.visits WHERE returned_badge_number_checked_by = @id" },
    { label: "Geraete rueckgegeben", query: "SELECT COUNT(*) AS count FROM dbo.visits WHERE device_returned_by = @id" },
    { label: "Besucher archiviert", query: "SELECT COUNT(*) AS count FROM dbo.visitors WHERE deleted_by = @id" },
    { label: "Wachen deaktiviert", query: "SELECT COUNT(*) AS count FROM dbo.gates WHERE deactivated_by = @id" },
    { label: "Benutzer deaktiviert", query: "SELECT COUNT(*) AS count FROM dbo.users WHERE deactivated_by = @id" },
    { label: "Hinweistexte bearbeitet", query: "SELECT COUNT(*) AS count FROM dbo.badge_text_templates WHERE updated_by = @id OR deactivated_by = @id" },
    { label: "Gelaendeplaene hochgeladen", query: "SELECT COUNT(*) AS count FROM dbo.site_maps WHERE uploaded_by = @id OR deactivated_by = @id" },
    { label: "Auditlog-Aktionen", query: "SELECT COUNT(*) AS count FROM dbo.audit_logs WHERE user_id = @id" }
  ];

  const references: Array<{ label: string; count: number }> = [];

  for (const check of checks) {
    const result = await pool.request()
      .input("id", sql.UniqueIdentifier, userId)
      .query<{ count: number }>(check.query);
    const count = result.recordset[0]?.count ?? 0;

    if (count > 0) {
      references.push({ label: check.label, count });
    }
  }

  return references;
}

export function clearAuthCookie(response: Response) {
  clearSessionCookie(response);
}
