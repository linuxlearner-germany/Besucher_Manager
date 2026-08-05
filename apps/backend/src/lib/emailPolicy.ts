import { z } from "zod";

export const ALLOWED_HOST_EMAIL_DOMAIN = "bundeswehr.org";

export const bundeswehrEmailSchema = z.string().trim().email("Ungültige E-Mail-Adresse.").refine(
  (value) => value.toLowerCase().endsWith(`@${ALLOWED_HOST_EMAIL_DOMAIN}`),
  `Die Anmelder-E-Mail muss auf @${ALLOWED_HOST_EMAIL_DOMAIN} enden.`
);

export function normalizeHostEmail(value: string | null | undefined): string | null {
  const normalized = value?.trim().toLowerCase() || "";
  return normalized || null;
}
