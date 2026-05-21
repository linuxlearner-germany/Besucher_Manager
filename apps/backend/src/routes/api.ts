import crypto from "node:crypto";
import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { clearSessionCookie, getSessionCookieName, readSessionToken, setSessionCookie } from "../lib/authSession";
import { getVisitDetailForUser, getTodayVisitsForUser, checkInVisit, checkOutVisit } from "../lib/guardVisits";
import { getPool } from "../lib/db";
import { createPreRegistration, listActiveGates } from "../lib/publicPreRegistrations";
import { publicPreRegistrationSchema } from "../lib/publicPreRegistrationSchema";
import { checkRateLimit } from "../lib/rateLimit";
import { findUserById, findUserForLogin, verifyPassword } from "../lib/users";
import { VISIT_STATUS, type AuthenticatedUser } from "../lib/visitWorkflow";
import { writeAuditLog } from "../lib/auditLog";
import { env } from "../config/env";

const csrfCookieName = "visitor_manager_csrf";
const loginSchema = z.object({
  username: z.string().trim().min(1),
  password: z.string().min(1)
});
const checkOutSchema = z.object({
  signed_by_host_confirmed: z.boolean(),
  checkout_note: z.string().trim().optional()
});

export const apiRouter = Router();

function isSchemaMissingError(error: unknown): boolean {
  return error instanceof Error && error.message.includes("Invalid object name");
}

function issueCsrfToken(response: Response, currentToken?: string): string {
  const token = currentToken || crypto.randomUUID();

  response.cookie(csrfCookieName, token, {
    signed: true,
    sameSite: "strict",
    secure: env.APP_SECURE_COOKIES,
    httpOnly: true
  });

  return token;
}

function getRequestIp(request: Request): string {
  return request.ip || request.socket.remoteAddress || "unknown";
}

async function resolveAuthenticatedUser(request: Request): Promise<AuthenticatedUser | null> {
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
  request.auth = currentUser;
  return currentUser;
}

async function requireAuthenticatedUser(request: Request, response: Response): Promise<AuthenticatedUser | null> {
  const user = await resolveAuthenticatedUser(request);

  if (!user) {
    response.status(401).json({
      error: "AUTH_REQUIRED",
      message: "Anmeldung erforderlich."
    });
    return null;
  }

  return user;
}

async function requireRole(
  request: Request,
  response: Response,
  allowedRoles: Array<AuthenticatedUser["role"]>
): Promise<AuthenticatedUser | null> {
  const user = await requireAuthenticatedUser(request, response);

  if (!user) {
    return null;
  }

  if (!allowedRoles.includes(user.role)) {
    response.status(403).json({
      error: "FORBIDDEN",
      message: "Nicht ausreichend berechtigt."
    });
    return null;
  }

  return user;
}

apiRouter.get("/api/meta", (_request, response) => {
  response.json({
    modules: ["public-pre-registration", "guard-dashboard", "admin-panel"],
    status: "active"
  });
});

apiRouter.get("/api/auth/me", async (request, response) => {
  const user = await resolveAuthenticatedUser(request);

  if (!user) {
    return response.json({
      authenticated: false
    });
  }

  return response.json({
    authenticated: true,
    user
  });
});

apiRouter.post("/api/auth/login", async (request, response) => {
  const result = loginSchema.safeParse(request.body);

  if (!result.success) {
    return response.status(400).json({
      error: "VALIDATION_FAILED"
    });
  }

  const candidate = await findUserForLogin(result.data.username);

  if (!candidate || !candidate.isActive) {
    return response.status(401).json({
      error: "INVALID_CREDENTIALS",
      message: "Benutzername oder Passwort ist falsch."
    });
  }

  const passwordMatches = await verifyPassword(result.data.password, candidate.passwordHash);

  if (!passwordMatches) {
    return response.status(401).json({
      error: "INVALID_CREDENTIALS",
      message: "Benutzername oder Passwort ist falsch."
    });
  }

  const user: AuthenticatedUser = {
    id: candidate.id,
    username: candidate.username,
    role: candidate.role,
    gateId: candidate.gateId
  };

  setSessionCookie(response, user);

  return response.json({
    authenticated: true,
    user,
    redirectTo: user.role === "admin" ? "/admin" : "/wache"
  });
});

apiRouter.post("/api/auth/logout", (_request, response) => {
  clearSessionCookie(response);
  response.json({ success: true });
});

apiRouter.get("/api/public/gates", async (request, response) => {
  try {
    const gates = await listActiveGates();
    const csrfToken = issueCsrfToken(response, request.signedCookies?.[csrfCookieName] as string | undefined);
    return response.json({ gates, csrfToken });
  } catch (error) {
    console.error(error);

    if (isSchemaMissingError(error)) {
      return response.status(500).json({
        error: "DATABASE_SCHEMA_MISSING",
        message: "Die Datenbanktabellen wurden noch nicht initialisiert. Bitte Migrationen ausfuehren."
      });
    }

    return response.status(500).json({
      error: "gate_list_failed",
      message: "Die Wachen konnten nicht geladen werden."
    });
  }
});

apiRouter.post("/api/public/pre-registrations", async (request, response) => {
  const csrfCookieToken = request.signedCookies?.[csrfCookieName];
  const csrfHeaderToken = request.header("x-csrf-token");

  if (!csrfCookieToken || !csrfHeaderToken || csrfCookieToken !== csrfHeaderToken) {
    return response.status(403).json({
      error: "csrf_failed"
    });
  }

  const ipAddress = getRequestIp(request);
  const rateLimit = checkRateLimit(
    `public-pre-registration:${ipAddress}`,
    env.PUBLIC_FORM_RATE_LIMIT,
    env.PUBLIC_FORM_RATE_WINDOW_SECONDS
  );

  response.setHeader("X-RateLimit-Limit", env.PUBLIC_FORM_RATE_LIMIT.toString());
  response.setHeader("X-RateLimit-Remaining", rateLimit.remaining.toString());

  if (!rateLimit.allowed) {
    response.setHeader("Retry-After", rateLimit.retryAfterSeconds.toString());
    return response.status(429).json({
      error: "rate_limited",
      retryAfterSeconds: rateLimit.retryAfterSeconds
    });
  }

  const result = publicPreRegistrationSchema.safeParse(request.body);

  if (!result.success) {
    return response.status(400).json({
      error: "VALIDATION_FAILED",
      details: result.error.flatten()
    });
  }

  try {
    const created = await createPreRegistration({
      ...result.data,
      submittedIpAddress: ipAddress
    });

    return response.status(201).json({
      status: created.status,
      visitId: created.visitId,
      visitorId: created.visitorId,
      message: "Voranmeldung wurde erfolgreich gespeichert."
    });
  } catch (error) {
    if (error instanceof Error && error.message === "gate_not_found") {
      return response.status(404).json({
        error: "gate_not_found",
        message: "Die ausgewaehlte Wache ist nicht mehr aktiv."
      });
    }

    console.error(error);
    return response.status(500).json({
      error: "pre_registration_failed",
      message: "Die Voranmeldung konnte nicht gespeichert werden."
    });
  }
});

apiRouter.get("/api/guard/visits/today", async (request, response) => {
  const user = await requireRole(request, response, ["admin", "guard"]);

  if (!user) {
    return;
  }

  try {
    const visits = await getTodayVisitsForUser(user, {
      search: typeof request.query.search === "string" ? request.query.search : undefined,
      status: typeof request.query.status === "string" ? request.query.status : undefined
    });

    return response.json({ visits });
  } catch (error) {
    console.error(error);
    return response.status(500).json({
      error: "VISIT_LIST_FAILED",
      message: "Die Tagesuebersicht konnte nicht geladen werden."
    });
  }
});

apiRouter.get("/api/guard/visits/:id", async (request, response) => {
  const user = await requireRole(request, response, ["admin", "guard"]);

  if (!user) {
    return;
  }

  try {
    const visit = await getVisitDetailForUser(user, request.params.id);

    if (!visit) {
      return response.status(404).json({
        error: "VISIT_NOT_FOUND"
      });
    }

    return response.json({ visit });
  } catch (error) {
    console.error(error);
    return response.status(500).json({
      error: "VISIT_DETAIL_FAILED",
      message: "Die Besuchsdaten konnten nicht geladen werden."
    });
  }
});

apiRouter.post("/api/guard/visits/:id/check-in", async (request, response) => {
  const user = await requireRole(request, response, ["admin", "guard"]);

  if (!user) {
    return;
  }

  try {
    await checkInVisit(user, request.params.id, getRequestIp(request));
    return response.json({
      success: true,
      status: VISIT_STATUS.CHECKED_IN
    });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "visit_not_found") {
        return response.status(404).json({ error: "VISIT_NOT_FOUND" });
      }

      if (error.message === "visit_scope_forbidden") {
        return response.status(403).json({ error: "VISIT_SCOPE_FORBIDDEN" });
      }

      if (error.message === "invalid_check_in_status") {
        return response.status(409).json({
          error: "INVALID_CHECK_IN_STATUS",
          message: "Der Besuch kann in diesem Status nicht eingecheckt werden."
        });
      }
    }

    console.error(error);
    return response.status(500).json({
      error: "CHECK_IN_FAILED",
      message: "Der Check-in konnte nicht gespeichert werden."
    });
  }
});

apiRouter.post("/api/guard/visits/:id/check-out", async (request, response) => {
  const user = await requireRole(request, response, ["admin", "guard"]);

  if (!user) {
    return;
  }

  const result = checkOutSchema.safeParse(request.body);

  if (!result.success) {
    return response.status(400).json({
      error: "VALIDATION_FAILED"
    });
  }

  try {
    await checkOutVisit(
      user,
      request.params.id,
      result.data.signed_by_host_confirmed,
      result.data.checkout_note,
      getRequestIp(request)
    );

    return response.json({
      success: true,
      status: VISIT_STATUS.CHECKED_OUT
    });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "visit_not_found") {
        return response.status(404).json({ error: "VISIT_NOT_FOUND" });
      }

      if (error.message === "visit_scope_forbidden") {
        return response.status(403).json({ error: "VISIT_SCOPE_FORBIDDEN" });
      }

      if (error.message === "host_signature_required") {
        return response.status(400).json({
          error: "HOST_SIGNATURE_REQUIRED",
          message: "Die Unterschrift des Ansprechpartners muss bestaetigt werden."
        });
      }

      if (error.message === "invalid_check_out_status") {
        return response.status(409).json({
          error: "INVALID_CHECK_OUT_STATUS",
          message: "Der Besuch kann in diesem Status nicht ausgecheckt werden."
        });
      }
    }

    console.error(error);
    return response.status(500).json({
      error: "CHECK_OUT_FAILED",
      message: "Der Check-out konnte nicht gespeichert werden."
    });
  }
});

apiRouter.post("/api/guard/visits/:id/print-log", async (request, response) => {
  const user = await requireRole(request, response, ["admin", "guard"]);

  if (!user) {
    return;
  }

  await writeAuditLog({
    user: user.username,
    action: "VISIT_PRINTED",
    objectType: "visit",
    objectId: request.params.id,
    ipAddress: getRequestIp(request)
  });

  return response.json({ success: true });
});

apiRouter.get("/api/admin/badge-texts", async (request, response) => {
  const user = await requireRole(request, response, ["admin"]);

  if (!user) {
    return;
  }

  const pool = await getPool();
  const result = await pool.request().query<{ id: string; name: string; textType: string; content: string }>(`
    SELECT
      id,
      name,
      text_type AS textType,
      content
    FROM dbo.badge_text_templates
    WHERE is_active = 1
    ORDER BY text_type ASC, name ASC
  `);

  return response.json({
    texts: result.recordset
  });
});

apiRouter.get("/api/admin/bootstrap", async (request, response) => {
  const user = await requireRole(request, response, ["admin"]);

  if (!user) {
    return;
  }

  const pool = await getPool();
  const [users, gates, templates] = await Promise.all([
    pool.request().query<{ count: number }>("SELECT COUNT(*) AS count FROM dbo.users"),
    pool.request().query<{ count: number }>("SELECT COUNT(*) AS count FROM dbo.gates"),
    pool.request().query<{ count: number }>("SELECT COUNT(*) AS count FROM dbo.badge_text_templates")
  ]);

  return response.json({
    users: users.recordset[0]?.count ?? 0,
    gates: gates.recordset[0]?.count ?? 0,
    templates: templates.recordset[0]?.count ?? 0
  });
});
