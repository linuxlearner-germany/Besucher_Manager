import { Router } from "express";
import { z } from "zod";
import { clearSessionCookie, setSessionCookie } from "../lib/authSession";
import { createPreRegistration, listActiveGates } from "../lib/publicPreRegistrations";
import { publicPreRegistrationSchema } from "../lib/publicPreRegistrationSchema";
import { checkRateLimit } from "../lib/rateLimit";
import { findUserForLogin, verifyPassword } from "../lib/users";
import {
  handleUnexpectedError,
  issueCsrfToken,
  resolveAuthenticatedUser,
  sendValidationError
} from "./shared";
import { adminRouter } from "./admin";
import { guardRouter } from "./guard";
import { sibeRouter } from "./sibe";

const loginSchema = z.object({
  username: z.string().trim().min(1),
  password: z.string().min(1)
});

export const apiRouter = Router();

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
      user: null
    });
  }

  return response.json({
    user
  });
});

apiRouter.post("/api/auth/login", async (request, response) => {
  const parsed = loginSchema.safeParse(request.body);
  if (!parsed.success) {
    return sendValidationError(response, parsed.error.flatten());
  }

  try {
    const candidate = await findUserForLogin(parsed.data.username);
    if (!candidate || !candidate.isActive) {
      return response.status(401).json({
        error: "INVALID_CREDENTIALS",
        message: "Benutzername oder Passwort ist ungueltig."
      });
    }

    const passwordMatches = await verifyPassword(parsed.data.password, candidate.passwordHash);
    if (!passwordMatches) {
      return response.status(401).json({
        error: "INVALID_CREDENTIALS",
        message: "Benutzername oder Passwort ist ungueltig."
      });
    }

    setSessionCookie(response, {
      id: candidate.id,
      username: candidate.username,
      role: candidate.role,
      gateId: candidate.gateId
    });
    return response.json({
      user: {
        id: candidate.id,
        username: candidate.username,
        displayName: candidate.username,
        role: candidate.role,
        gateId: candidate.gateId,
        gateName: null
      }
    });
  } catch (error) {
    return handleUnexpectedError(response, error, "DATABASE_ERROR", "Anmeldung fehlgeschlagen.");
  }
});

apiRouter.post("/api/auth/logout", async (_request, response) => {
  clearSessionCookie(response);
  response.json({ success: true });
});

apiRouter.get("/api/public/gates", async (_request, response) => {
  try {
    const [gates, csrfToken] = await Promise.all([
      listActiveGates(),
      issueCsrfToken(response)
    ]);

    response.json({
      gates,
      csrfToken
    });
  } catch (error) {
    return handleUnexpectedError(response, error, "DATABASE_ERROR", "Wachen konnten nicht geladen werden.");
  }
});

apiRouter.post("/api/public/pre-registrations", async (request, response) => {
  const rateLimitKey = `public-pre-registration:${request.ip || request.socket.remoteAddress || "unknown"}`;
  const rateLimitDecision = checkRateLimit(rateLimitKey, 20, 60);
  if (!rateLimitDecision.allowed) {
    response.setHeader("Retry-After", String(rateLimitDecision.retryAfterSeconds));
    return response.status(429).json({
      error: "RATE_LIMITED",
      message: "Zu viele Anfragen. Bitte spaeter erneut versuchen."
    });
  }

  const parsed = publicPreRegistrationSchema.safeParse(request.body);
  if (!parsed.success) {
    return sendValidationError(response, parsed.error.flatten());
  }

  try {
    const created = await createPreRegistration({
      ...parsed.data,
      submittedIpAddress: request.ip || request.socket.remoteAddress || null,
      userAgent: typeof request.headers["user-agent"] === "string" ? request.headers["user-agent"] : null
    });
    return response.status(201).json({
      message: "Voranmeldung erfolgreich gespeichert.",
      visitId: created.visitId,
      visitorId: created.visitorId,
      status: created.status
    });
  } catch (error) {
    return handleUnexpectedError(response, error, "DATABASE_ERROR", "Die Voranmeldung konnte nicht gespeichert werden.");
  }
});

apiRouter.use(guardRouter);
apiRouter.use(sibeRouter);
apiRouter.use(adminRouter);
