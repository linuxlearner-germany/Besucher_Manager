import crypto from "node:crypto";
import type { Response } from "express";
import { env } from "../config/env";
import type { AuthenticatedUser } from "./visitWorkflow";

const sessionCookieName = "visitor_manager_session";
const sessionTtlHours = 12;

type SessionPayload = {
  userId: string;
  username: string;
  role: AuthenticatedUser["role"];
  gateId: string | null;
  exp: number;
};

type SessionUser = Pick<AuthenticatedUser, "id" | "username" | "role" | "gateId">;

function toBase64Url(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

function fromBase64Url<T>(value: string): T {
  return JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as T;
}

function createSignature(payloadSegment: string): string {
  return crypto.createHmac("sha256", env.APP_SECRET).update(payloadSegment).digest("base64url");
}

export function createSessionToken(user: SessionUser): string {
  const payload: SessionPayload = {
    userId: user.id,
    username: user.username,
    role: user.role,
    gateId: user.gateId,
    exp: Date.now() + sessionTtlHours * 60 * 60 * 1000
  };

  const payloadSegment = toBase64Url(JSON.stringify(payload));
  const signature = createSignature(payloadSegment);
  return `${payloadSegment}.${signature}`;
}

export function readSessionToken(token: string | undefined): SessionUser | null {
  if (!token) {
    return null;
  }

  const [payloadSegment, providedSignature] = token.split(".");

  if (!payloadSegment || !providedSignature) {
    return null;
  }

  const expectedSignature = createSignature(payloadSegment);

  if (!crypto.timingSafeEqual(Buffer.from(expectedSignature), Buffer.from(providedSignature))) {
    return null;
  }

  const payload = fromBase64Url<SessionPayload>(payloadSegment);

  if (payload.exp < Date.now()) {
    return null;
  }

  return {
    id: payload.userId,
    username: payload.username,
    role: payload.role,
    gateId: payload.gateId
  };
}

export function setSessionCookie(response: Response, user: SessionUser): void {
  response.cookie(sessionCookieName, createSessionToken(user), {
    sameSite: "strict",
    secure: env.APP_SECURE_COOKIES,
    httpOnly: true,
    maxAge: sessionTtlHours * 60 * 60 * 1000
  });
}

export function clearSessionCookie(response: Response): void {
  response.clearCookie(sessionCookieName, {
    sameSite: "strict",
    secure: env.APP_SECURE_COOKIES,
    httpOnly: true
  });
}

export function getSessionCookieName(): string {
  return sessionCookieName;
}
