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
};

export type MailRelayTestKind =
  | "relay"
  | "nationality";

function buildVisitDetailUrl(visitId: string): string {
  return `${env.PUBLIC_BASE_URL.replace(/\/+$/, "")}/sibe/besucher/${visitId}`;
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

async function sendMail(request: MailRequest): Promise<boolean> {
  const settings = await loadWorkflowSettings({ includeSecrets: true });
  const relay = settings.emailRelay;

  if (!relay.enabled || !relay.host || !relay.fromAddress || request.to.length === 0) {
    return false;
  }

  const transport = nodemailer.createTransport({
    host: relay.host,
    port: relay.port,
    secure: relay.secure,
    auth: relay.username
      ? {
          user: relay.username,
          pass: relay.password
        }
      : undefined
  });

  await transport.sendMail({
    from: relay.fromAddress,
    to: request.to.join(", "),
    subject: request.subject,
    text: request.text
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
  return sendMail({
    to: [payload.to],
    subject: payload.subject,
    text: [
      payload.reminder ? "Erinnerung an einen bevorstehenden Besuch." : "Ihre Voranmeldung wurde gespeichert.",
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
    ].join("\n")
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
  return sendMail({
    to: [payload.to],
    subject: "Besucher Manager: Gruppenanmeldung bestätigt",
    text: [
      "Ihre Gruppenanmeldung wurde gespeichert.",
      "",
      `Anzahl Besucher: ${payload.visitorCount}`,
      `Besuchszweck: ${payload.purpose || "-"}`,
      `Gültig von: ${payload.validFrom}`,
      `Gültig bis: ${payload.validUntil}`
    ].join("\n")
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
  const settings = await loadWorkflowSettings({ includeSecrets: true });
  const relay = settings.emailRelay;

  if (!relay.host || !relay.fromAddress) {
    throw new Error("mail_relay_incomplete");
  }

  const transport = nodemailer.createTransport({
    host: relay.host,
    port: relay.port,
    secure: relay.secure,
    auth: relay.username
      ? {
          user: relay.username,
          pass: relay.password
        }
      : undefined
  });

  await transport.verify();

  const recipients = testRecipient?.trim() ? [testRecipient.trim()] : [];

  if (recipients.length === 0) {
    throw new Error("mail_relay_missing_test_recipient");
  }

  await transport.sendMail({
    from: relay.fromAddress,
    to: recipients.join(", "),
    subject: "Besucher Manager: Test E-Mail Relay",
    text: `Das E-Mail-Relay des Besucher Managers wurde erfolgreich getestet.\n\nZeitpunkt: ${new Date().toISOString()}`
  });
}

function buildMailRelayPreviewContent(kind: MailRelayTestKind) {
  const detailUrl = buildVisitDetailUrl("00000000-0000-0000-0000-000000000000");

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
      ].join("\n")
    };
  }

  return {
    subject: "Besucher Manager: Test E-Mail Relay",
    text: `Das E-Mail-Relay des Besucher Managers wurde erfolgreich getestet.\n\nZeitpunkt: ${new Date().toISOString()}`
  };
}

export async function sendMailRelayPreview(kind: MailRelayTestKind, recipient: string): Promise<void> {
  const settings = await loadWorkflowSettings({ includeSecrets: true });
  const relay = settings.emailRelay;
  const normalizedRecipient = normalizeUserEmail(recipient);

  if (!relay.host || !relay.fromAddress) {
    throw new Error("mail_relay_incomplete");
  }

  if (!normalizedRecipient) {
    throw new Error("mail_relay_missing_test_recipient");
  }

  const transport = nodemailer.createTransport({
    host: relay.host,
    port: relay.port,
    secure: relay.secure,
    auth: relay.username
      ? {
          user: relay.username,
          pass: relay.password
        }
      : undefined
  });

  await transport.verify();

  const preview = buildMailRelayPreviewContent(kind);

  await transport.sendMail({
    from: relay.fromAddress,
    to: normalizedRecipient,
    subject: preview.subject,
    text: preview.text
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
        const sent = await sendMail({
          to: [subscriber.email],
          subject: `Nationalitätsmeldung: ${countryName} – ${payload.visitorName}`,
          text: [
            "Für ein abonniertes Land wurde ein Besuch angemeldet.", "",
            `Nationalität: ${countryName} (${countryCode})`,
            `Besucher: ${payload.visitorName}`,
            `Firma: ${payload.company}`,
            `Besuchszeitraum: ${payload.validFrom} bis ${payload.validUntil}`,
            `Wache: ${payload.gateName || "Noch nicht zugeordnet"}`, "",
            `Details: ${buildVisitDetailUrl(payload.visitId)}`
          ].join("\n")
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
