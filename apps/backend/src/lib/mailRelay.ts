import nodemailer from "nodemailer";
import { env } from "../config/env";
import { writeErrorLog } from "./errorLogs";
import { loadWorkflowSettings } from "./systemSettings";
import sql from "mssql";
import { getCountryName, normalizeCountryCode } from "./countries";
import { getPool } from "./db";
import { normalizeUserEmail } from "./users";

type MailRequest = {
  to: string[];
  subject: string;
  text: string;
  html?: string;
};

export function createMailMessage(request: MailRequest, mailFormat: "text" | "html") {
  return {
    subject: request.subject,
    text: request.text,
    ...(mailFormat === "html" && request.html ? { html: request.html } : {})
  };
}

type MailRelaySettings = Awaited<ReturnType<typeof loadWorkflowSettings>>["emailRelay"];

export type MailRelayTestKind =
  | "relay"
  | "nationality"
  | "pre_registration"
  | "reminder";

function buildVisitDetailUrl(visitId: string): string {
  return `${env.PUBLIC_BASE_URL.replace(/\/+$/, "")}/sibe/besucher/${visitId}`;
}

type MailDetail = { label: string; value: string | null | undefined };

export function escapeMailHtml(value: string | null | undefined): string {
  return String(value ?? "-")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** A neutral shared layout for every application mail. */
export function buildMailHtml(payload: {
  heading: string;
  introduction: string;
  details?: MailDetail[];
  detailUrl?: string;
  footer?: string;
}): string {
  const rows = (payload.details ?? []).map(({ label, value }) =>
    `<tr><td style="padding:8px 12px;color:#52606d;font-weight:600;vertical-align:top;width:38%">${escapeMailHtml(label)}</td><td style="padding:8px 12px;color:#172b4d">${escapeMailHtml(value)}</td></tr>`
  ).join("");
  const link = payload.detailUrl
    ? `<p style="margin:24px 0 0"><a href="${escapeMailHtml(payload.detailUrl)}" style="color:#075a9c;word-break:break-all">Zur Detailansicht</a></p>`
    : "";
  return `<!doctype html><html lang="de"><body style="margin:0;padding:24px;background:#f4f6f8;font-family:Arial,sans-serif;color:#172b4d"><main style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #dfe3e8;border-radius:6px;overflow:hidden"><header style="background:#075a9c;color:#ffffff;padding:20px 28px"><strong style="font-size:18px">Besucher Manager</strong></header><section style="padding:28px"><h1 style="font-size:22px;margin:0 0 16px">${escapeMailHtml(payload.heading)}</h1><p style="margin:0 0 20px;line-height:1.5">${escapeMailHtml(payload.introduction)}</p>${rows ? `<table role="presentation" style="width:100%;border-collapse:collapse;background:#f8fafc;border:1px solid #dfe3e8"><tbody>${rows}</tbody></table>` : ""}${link}</section><footer style="padding:16px 28px;background:#f8fafc;color:#52606d;font-size:12px;line-height:1.4">${escapeMailHtml(payload.footer ?? "Diese E-Mail wurde automatisch vom Besucher Manager versendet.")}</footer></main></body></html>`;
}

export function mergeMailRecipients(...recipientSets: Array<Array<string | null | undefined>>): string[] {
  return Array.from(
    new Set(
      recipientSets
        .flat()
        .map((entry) => normalizeUserEmail(entry))
        .filter((entry): entry is string => Boolean(entry))
    )
  );
}

function hasMailRelayConfiguration(relay: MailRelaySettings): boolean {
  return Boolean(relay.host && relay.fromAddress);
}

function createMailTransport(relay: MailRelaySettings, options?: { allowInvalidCertificate?: boolean }) {
  return nodemailer.createTransport({
    host: relay.host,
    port: relay.port,
    secure: relay.secure,
    auth: relay.username
      ? {
          user: relay.username,
          pass: relay.password
        }
      : undefined,
    ...(options?.allowInvalidCertificate ? { tls: { rejectUnauthorized: false } } : {})
  });
}

async function loadConfiguredMailRelay(): Promise<MailRelaySettings> {
  const { emailRelay } = await loadWorkflowSettings({ includeSecrets: true });
  if (!hasMailRelayConfiguration(emailRelay)) {
    throw new Error("mail_relay_incomplete");
  }
  return emailRelay;
}

function requireRecipient(recipient: string | null | undefined): string {
  const value = recipient?.trim();
  if (!value) {
    throw new Error("mail_relay_missing_test_recipient");
  }
  return value;
}

async function sendMail(request: MailRequest): Promise<boolean> {
  const settings = await loadWorkflowSettings({ includeSecrets: true });
  const relay = settings.emailRelay;

  if (!relay.enabled || !hasMailRelayConfiguration(relay) || request.to.length === 0) {
    return false;
  }

  const transport = createMailTransport(relay);

  await transport.sendMail({
    from: relay.fromAddress,
    to: request.to.join(", "),
    ...createMailMessage(request, settings.mailFormat)
  });

  return true;
}

export function formatVisitDate(value: Date | string): string {
  return new Intl.DateTimeFormat("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: "UTC"
  }).format(new Date(value));
}

async function sendVisitMail(payload: {
  to: string;
  subject: string;
  visitorName: string;
  company: string;
  hostName: string;
  purpose: string;
  validFrom: Date | string;
  validUntil: Date | string;
  gateName: string | null;
  visitId: string;
  reminder: boolean;
}): Promise<boolean> {
  const introduction = payload.reminder ? "Erinnerung an einen bevorstehenden Besuch." : "Ihre Voranmeldung wurde gespeichert.";
  const details: MailDetail[] = [
    { label: "Besucher", value: payload.visitorName },
    { label: "Firma", value: payload.company || "-" },
    { label: "Ansprechpartner", value: payload.hostName || "-" },
    { label: "Besuchszweck", value: payload.purpose || "-" },
    { label: "Wache", value: payload.gateName || "-" },
    { label: "Gültig von", value: formatVisitDate(payload.validFrom) },
    { label: "Gültig bis", value: formatVisitDate(payload.validUntil) },
    { label: "Besuchs-ID", value: payload.visitId }
  ];
  return sendMail({
    to: [payload.to],
    subject: payload.subject,
    text: [
      introduction,
      "",
      `Besucher: ${payload.visitorName}`,
      `Firma: ${payload.company || "-"}`,
      `Ansprechpartner: ${payload.hostName || "-"}`,
      `Besuchszweck: ${payload.purpose || "-"}`,
      `Wache: ${payload.gateName || "-"}`,
      `Gültig von: ${formatVisitDate(payload.validFrom)}`,
      `Gültig bis: ${formatVisitDate(payload.validUntil)}`,
      `Besuchs-ID: ${payload.visitId}`,
      "",
      "Diese E-Mail wurde automatisch vom Besucher Manager versendet."
    ].join("\n"),
    html: buildMailHtml({
      heading: payload.reminder ? "Erinnerung an Ihren Besuch" : "Voranmeldung bestätigt",
      introduction,
      details,
      detailUrl: buildVisitDetailUrl(payload.visitId)
    })
  });
}

export async function sendPreRegistrationConfirmation(payload: Omit<Parameters<typeof sendVisitMail>[0], "subject" | "reminder">): Promise<boolean> {
  return sendVisitMail({ ...payload, subject: "Besucher Manager: Voranmeldung bestätigt", reminder: false });
}

export async function sendVisitReminder(payload: Omit<Parameters<typeof sendVisitMail>[0], "subject" | "reminder">): Promise<boolean> {
  return sendVisitMail({ ...payload, subject: "Besucher Manager: Erinnerung an Ihren Besuch", reminder: true });
}

export async function sendGroupPreRegistrationConfirmation(payload: {
  to: string;
  visitorCount: number;
  validFrom: string;
  validUntil: string;
  purpose: string;
}): Promise<boolean> {
  const introduction = "Ihre Gruppenanmeldung wurde gespeichert.";
  return sendMail({
    to: [payload.to],
    subject: "Besucher Manager: Gruppenanmeldung bestätigt",
    text: [
      introduction,
      "",
      `Anzahl Besucher: ${payload.visitorCount}`,
      `Besuchszweck: ${payload.purpose || "-"}`,
      `Gültig von: ${payload.validFrom}`,
      `Gültig bis: ${payload.validUntil}`
    ].join("\n"),
    html: buildMailHtml({
      heading: "Gruppenanmeldung bestätigt",
      introduction,
      details: [
        { label: "Anzahl Besucher", value: String(payload.visitorCount) },
        { label: "Besuchszweck", value: payload.purpose || "-" },
        { label: "Gültig von", value: payload.validFrom },
        { label: "Gültig bis", value: payload.validUntil }
      ]
    })
  });
}

export async function sendDueVisitReminders(): Promise<number> {
  const pool = await getPool();
  const result = await pool.request().query<{
    id: string;
    hostEmail: string;
    visitorName: string;
    company: string;
    hostName: string;
    purpose: string;
    validFrom: Date;
    validUntil: Date;
    gateName: string | null;
  }>(`
    SELECT v.id, v.host_email AS hostEmail,
      CONCAT(vis.first_name, ' ', vis.last_name) AS visitorName,
      vis.company, v.host_name AS hostName, v.purpose,
      v.valid_from AS validFrom, v.valid_until AS validUntil, g.name AS gateName
    FROM dbo.visits v
    INNER JOIN dbo.visitors vis ON vis.id = v.visitor_id
    LEFT JOIN dbo.gates g ON g.id = v.gate_id
    WHERE v.status = 'pre_registered'
      AND v.host_email IS NOT NULL
      AND v.reminder_sent_at IS NULL
      AND v.valid_from <= DATEADD(HOUR, 24, SYSUTCDATETIME())
      AND v.valid_from > SYSUTCDATETIME()
  `);

  let sent = 0;
  for (const visit of result.recordset) {
    try {
      const delivered = await sendVisitReminder({ ...visit, to: visit.hostEmail, visitId: visit.id });
      if (!delivered) continue;
      await pool.request().input("id", sql.UniqueIdentifier, visit.id).query("UPDATE dbo.visits SET reminder_sent_at = SYSUTCDATETIME(), updated_at = SYSUTCDATETIME() WHERE id = @id AND reminder_sent_at IS NULL");
      sent += 1;
    } catch (error) {
      await writeErrorLog({ errorCode: "VISIT_REMINDER_SEND_FAILED", message: error instanceof Error ? error.message : "unknown", requestPath: "scheduler" }).catch(() => undefined);
    }
  }
  return sent;
}

export async function verifyMailRelayConnection(testRecipient?: string): Promise<void> {
  const relay = await loadConfiguredMailRelay();
  const recipient = requireRecipient(testRecipient);
  const transport = createMailTransport(relay, { allowInvalidCertificate: true });
  await transport.verify();

  await transport.sendMail({
    from: relay.fromAddress,
    to: recipient,
    subject: "Besucher Manager: Test E-Mail Relay",
    text: `Das E-Mail-Relay des Besucher Managers wurde erfolgreich getestet.\n\nZeitpunkt: ${new Date().toISOString()}`,
    ...( (await loadWorkflowSettings()).mailFormat === "html" ? { html: buildMailHtml({ heading: "Test E-Mail Relay", introduction: "Das E-Mail-Relay des Besucher Managers wurde erfolgreich getestet.", details: [{ label: "Zeitpunkt", value: new Date().toISOString() }] }) } : {})
  });
}

export function buildMailRelayPreviewContent(kind: MailRelayTestKind) {
  const detailUrl = buildVisitDetailUrl("00000000-0000-0000-0000-000000000000");

  if (kind === "pre_registration" || kind === "reminder") {
    const reminder = kind === "reminder";
    const introduction = reminder ? "Erinnerung an einen bevorstehenden Besuch." : "Ihre Voranmeldung wurde gespeichert.";
    const details: MailDetail[] = [
      { label: "Besucher", value: "Max Mustermann" },
      { label: "Firma", value: "Musterfirma GmbH" },
      { label: "Ansprechpartner", value: "Test Ansprechpartner" },
      { label: "Besuchszweck", value: "Testversand Besucher Manager" },
      { label: "Wache", value: "Hauptwache" },
      { label: "Gültig von", value: "07.08.2026, 08:00" },
      { label: "Gültig bis", value: "07.08.2026, 17:00" },
      { label: "Besuchs-ID", value: "00000000-0000-0000-0000-000000000000" }
    ];
    return {
      subject: reminder ? "Besucher Manager: Erinnerung an Ihren Besuch" : "Besucher Manager: Voranmeldung bestätigt",
      text: [
        introduction,
        "",
        "Besucher: Max Mustermann",
        "Firma: Musterfirma GmbH",
        "Ansprechpartner: Test Ansprechpartner",
        "Besuchszweck: Testversand Besucher Manager",
        "Wache: Hauptwache",
        "Gültig von: 07.08.2026, 08:00",
        "Gültig bis: 07.08.2026, 17:00",
        "Besuchs-ID: 00000000-0000-0000-0000-000000000000",
        "",
        "Diese E-Mail wurde automatisch vom Besucher Manager versendet."
      ].join("\n"),
      html: buildMailHtml({
        heading: reminder ? "Erinnerung an Ihren Besuch" : "Voranmeldung bestätigt",
        introduction,
        details,
        detailUrl
      })
    };
  }

  if (kind === "nationality") {
    return {
      subject: "Nationalitätsmeldung: Deutschland – Max Mustermann",
      text: [
        "Für ein abonniertes Land wurde ein Besuch angemeldet.",
        "",
        "Nationalität: Deutschland (DE)",
        "Besucher: Max Mustermann",
        "Firma: Musterfirma GmbH",
        "Wache: Hauptwache",
        "Gültig von: 07.07.2026, 08:00",
        "Gültig bis: 07.07.2026, 17:00",
        "",
        `Details: ${detailUrl}`
      ].join("\n"),
      html: buildMailHtml({
        heading: "Nationalitätsmeldung",
        introduction: "Für ein abonniertes Land wurde ein Besuch angemeldet.",
        details: [{ label: "Nationalität", value: "Deutschland (DE)" }, { label: "Besucher", value: "Max Mustermann" }, { label: "Firma", value: "Musterfirma GmbH" }, { label: "Wache", value: "Hauptwache" }, { label: "Gültig von", value: "07.07.2026, 08:00" }, { label: "Gültig bis", value: "07.07.2026, 17:00" }],
        detailUrl
      })
    };
  }

  return {
    subject: "Besucher Manager: Test E-Mail Relay",
    text: `Das E-Mail-Relay des Besucher Managers wurde erfolgreich getestet.\n\nZeitpunkt: ${new Date().toISOString()}`,
    html: buildMailHtml({ heading: "Test E-Mail Relay", introduction: "Das E-Mail-Relay des Besucher Managers wurde erfolgreich getestet.", details: [{ label: "Zeitpunkt", value: new Date().toISOString() }] })
  };
}

export async function sendMailRelayPreview(kind: MailRelayTestKind, recipient: string): Promise<void> {
  const relay = await loadConfiguredMailRelay();
  const normalizedRecipient = normalizeUserEmail(recipient);
  const targetRecipient = requireRecipient(normalizedRecipient);
  const transport = createMailTransport(relay, { allowInvalidCertificate: true });
  await transport.verify();

  const preview = buildMailRelayPreviewContent(kind);

  await transport.sendMail({
    from: relay.fromAddress,
    to: targetRecipient,
    subject: preview.subject,
    text: preview.text,
    ...( (await loadWorkflowSettings()).mailFormat === "html" ? { html: preview.html } : {})
  });
}

export async function notifyNationalitySubscribers(payload: {
  visitId: string;
  nationalityCode: string;
  visitorName: string;
  company: string;
  validFrom: string;
  validUntil: string;
  gateName: string | null;
}): Promise<void> {
  const countryCode = normalizeCountryCode(payload.nationalityCode);
  if (!countryCode) return;
  try {
    const pool = await getPool();
    const subscribers = await pool.request()
      .input("visitId", sql.UniqueIdentifier, payload.visitId)
      .input("countryCode", sql.NChar(2), countryCode)
      .query<{ userId: string; email: string }>(`
        DECLARE @newDeliveries TABLE (user_id UNIQUEIDENTIFIER NOT NULL);

        INSERT INTO dbo.nationality_notification_deliveries (visit_id, user_id, country_code)
        OUTPUT inserted.user_id INTO @newDeliveries (user_id)
        SELECT @visitId, s.user_id, @countryCode
        FROM dbo.user_nationality_subscriptions s
        INNER JOIN dbo.users u ON u.id = s.user_id
        WHERE s.country_code = @countryCode
          AND u.role = 'sibe'
          AND u.is_active = 1
          AND NULLIF(LTRIM(RTRIM(u.user_email)), '') IS NOT NULL
          AND NOT EXISTS (
            SELECT 1 FROM dbo.nationality_notification_deliveries d
            WHERE d.visit_id = @visitId AND d.user_id = s.user_id
          );

        SELECT n.user_id AS userId, u.user_email AS email
        FROM @newDeliveries n
        INNER JOIN dbo.users u ON u.id = n.user_id;
      `);
    const countryName = getCountryName(countryCode) || countryCode;
    for (const subscriber of subscribers.recordset) {
      try {
        const introduction = "Für ein abonniertes Land wurde ein Besuch angemeldet.";
        const details: MailDetail[] = [
          { label: "Nationalität", value: `${countryName} (${countryCode})` },
          { label: "Besucher", value: payload.visitorName },
          { label: "Firma", value: payload.company || "-" },
          { label: "Besuchszeitraum", value: `${payload.validFrom} bis ${payload.validUntil}` },
          { label: "Wache", value: payload.gateName || "Noch nicht zugeordnet" }
        ];
        const sent = await sendMail({
          to: [subscriber.email],
          subject: `Nationalitätsmeldung: ${countryName} – ${payload.visitorName}`,
          text: [
            introduction, "",
            `Nationalität: ${countryName} (${countryCode})`,
            `Besucher: ${payload.visitorName}`,
            `Firma: ${payload.company}`,
            `Besuchszeitraum: ${payload.validFrom} bis ${payload.validUntil}`,
            `Wache: ${payload.gateName || "Noch nicht zugeordnet"}`, "",
            `Details: ${buildVisitDetailUrl(payload.visitId)}`
          ].join("\n"),
          html: buildMailHtml({ heading: "Nationalitätsmeldung", introduction, details, detailUrl: buildVisitDetailUrl(payload.visitId) })
        });
        await pool.request()
          .input("visitId", sql.UniqueIdentifier, payload.visitId)
          .input("userId", sql.UniqueIdentifier, subscriber.userId)
          .query(`UPDATE dbo.nationality_notification_deliveries SET sent_at = CASE WHEN ${sent ? "1" : "0"} = 1 THEN SYSUTCDATETIME() ELSE sent_at END WHERE visit_id = @visitId AND user_id = @userId`);
      } catch (error) {
        await pool.request()
          .input("visitId", sql.UniqueIdentifier, payload.visitId)
          .input("userId", sql.UniqueIdentifier, subscriber.userId)
          .query("UPDATE dbo.nationality_notification_deliveries SET failed_at = SYSUTCDATETIME() WHERE visit_id = @visitId AND user_id = @userId");
        await writeErrorLog({
          level: "warning",
          errorCode: "MAIL_RELAY_NATIONALITY_RECIPIENT_FAILED",
          message: "Nationalitätsmeldung konnte an einen SiBe-Benutzer nicht zugestellt werden.",
          stackTrace: error instanceof Error ? error.stack ?? null : null,
          metadataJson: JSON.stringify({ visitId: payload.visitId, userId: subscriber.userId })
        });
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unbekannter Fehler";
    await writeErrorLog({
      level: "warning",
      errorCode: "MAIL_RELAY_NATIONALITY_NOTIFICATION_FAILED",
      message: "Nationalitätsmeldung konnte nicht per E-Mail versendet werden.",
      stackTrace: error instanceof Error ? error.stack ?? null : null,
      metadataJson: JSON.stringify({
        error: message,
        visitId: payload.visitId
      })
    });
  }
}
