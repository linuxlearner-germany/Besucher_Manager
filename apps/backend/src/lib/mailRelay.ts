import nodemailer from "nodemailer";
import { env } from "../config/env";
import { writeErrorLog } from "./errorLogs";
import { loadWorkflowSettings } from "./systemSettings";
import { listNotificationEmailsByMenuAccess, normalizeUserEmail } from "./users";

type MailRequest = {
  to: string[];
  subject: string;
  text: string;
};

type ApprovalRequestNotification = {
  visitId: string;
  visitorName: string;
  company: string;
  hostName: string;
  validFrom: string;
  validUntil: string;
  gateName: string | null;
};

type ApprovalDecisionNotification = {
  visitId: string;
  visitorName: string;
  company: string;
  hostName: string;
  decision: "approved" | "rejected";
  note: string | null;
  recipientEmails: string[];
};

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

  const recipients = testRecipient?.trim()
    ? [testRecipient.trim()]
    : relay.approvalRecipients;

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

export async function notifyApprovalRequested(payload: ApprovalRequestNotification): Promise<void> {
  try {
    const settings = await loadWorkflowSettings();
    if (!settings.emailRelay.enabled) {
      return;
    }

    const approvalUsers = await listNotificationEmailsByMenuAccess("genehmigung");
    const recipients = mergeMailRecipients(settings.emailRelay.approvalRecipients, approvalUsers);

    if (recipients.length === 0) {
      return;
    }

    await sendMail({
      to: recipients,
      subject: `Besucherfreigabe erforderlich: ${payload.visitorName}`,
      text: [
        "Eine neue Besuchervoranmeldung wartet auf SiBe-Freigabe.",
        "",
        `Besucher: ${payload.visitorName}`,
        `Firma: ${payload.company}`,
        `Ansprechpartner: ${payload.hostName}`,
        `Wache: ${payload.gateName || "Noch nicht zugeordnet"}`,
        `Gültig von: ${payload.validFrom}`,
        `Gültig bis: ${payload.validUntil}`,
        "",
        `Details: ${buildVisitDetailUrl(payload.visitId)}`
      ].join("\n")
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unbekannter Fehler";
    await writeErrorLog({
      level: "warning",
      errorCode: "MAIL_RELAY_APPROVAL_REQUEST_FAILED",
      message: "Freigabeanfrage konnte nicht per E-Mail versendet werden.",
      stackTrace: error instanceof Error ? error.stack ?? null : null,
      metadataJson: JSON.stringify({
        error: message,
        visitId: payload.visitId
      })
    });
  }
}

export async function notifyApprovalDecision(payload: ApprovalDecisionNotification): Promise<void> {
  const recipients = mergeMailRecipients(payload.recipientEmails);

  if (recipients.length === 0) {
    return;
  }

  try {
    await sendMail({
      to: recipients,
      subject: `Besucher ${payload.decision === "approved" ? "freigegeben" : "abgelehnt"}: ${payload.visitorName}`,
      text: [
        `Die Besuchervoranmeldung wurde ${payload.decision === "approved" ? "freigegeben" : "abgelehnt"}.`,
        "",
        `Besucher: ${payload.visitorName}`,
        `Firma: ${payload.company}`,
        `Ansprechpartner: ${payload.hostName}`,
        `Vorgang: ${payload.visitId}`,
        payload.note ? `Hinweis: ${payload.note}` : null
      ].filter(Boolean).join("\n")
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unbekannter Fehler";
    await writeErrorLog({
      level: "warning",
      errorCode: "MAIL_RELAY_APPROVAL_DECISION_FAILED",
      message: "Freigabeentscheidung konnte nicht per E-Mail versendet werden.",
      stackTrace: error instanceof Error ? error.stack ?? null : null,
      metadataJson: JSON.stringify({
        error: message,
        visitId: payload.visitId
      })
    });
  }
}
