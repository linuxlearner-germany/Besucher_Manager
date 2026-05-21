import crypto from "node:crypto";
import { Router, type Response } from "express";
import { z } from "zod";
import { env } from "../config/env";
import { createPreRegistration, listActiveGates } from "../lib/publicPreRegistrations";
import { checkRateLimit } from "../lib/rateLimit";

const csrfCookieName = "visitor_manager_csrf";

const visitRequestSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  company: z.string().min(1),
  hostName: z.string().min(1),
  hostDepartment: z.string().min(1),
  purpose: z.string().min(1),
  gateId: z.string().min(1),
  validFrom: z.string().datetime(),
  validUntil: z.string().datetime(),
  phone: z.string().optional(),
  email: z.string().email().optional(),
  licensePlate: z.string().optional(),
  notes: z.string().optional()
}).superRefine((value, context) => {
  const from = new Date(value.validFrom);
  const until = new Date(value.validUntil);

  if (Number.isNaN(from.getTime())) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["validFrom"],
      message: "Invalid validFrom value"
    });
  }

  if (Number.isNaN(until.getTime())) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["validUntil"],
      message: "Invalid validUntil value"
    });
  }

  if (!Number.isNaN(from.getTime()) && !Number.isNaN(until.getTime()) && until <= from) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["validUntil"],
      message: "validUntil must be after validFrom"
    });
  }
});

export const apiRouter = Router();

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

apiRouter.get("/api/meta", (_request, response) => {
  response.json({
    modules: ["public-pre-registration", "gate-dashboard", "admin-panel"],
    status: "scaffold"
  });
});

apiRouter.get("/api/public/gates", async (request, response) => {
  try {
    const gates = await listActiveGates();
    const csrfToken = issueCsrfToken(response, request.signedCookies?.[csrfCookieName] as string | undefined);
    return response.json({ gates, csrfToken });
  } catch (error) {
    console.error(error);
    return response.status(500).json({
      error: "gate_list_failed"
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

  const ipAddress = request.ip || request.socket.remoteAddress || "unknown";
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

  const result = visitRequestSchema.safeParse(request.body);

  if (!result.success) {
    return response.status(400).json({
      error: "validation_failed",
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
      visitorId: created.visitorId
    });
  } catch (error) {
    if (error instanceof Error && error.message === "gate_not_found") {
      return response.status(404).json({
        error: "gate_not_found"
      });
    }

    console.error(error);
    return response.status(500).json({
      error: "pre_registration_failed"
    });
  }
});

apiRouter.get("/api/gate/visits/today", (_request, response) => {
  response.json({
    visits: [],
    message: "Gate dashboard repository is not connected yet."
  });
});

apiRouter.get("/api/admin/bootstrap", (_request, response) => {
  response.json({
    users: 0,
    gates: 0,
    templates: 0,
    message: "Admin bootstrap endpoint is reserved for setup workflows."
  });
});
