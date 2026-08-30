import sql from "mssql";
import { z } from "zod";
import { env } from "../config/env";
import { getPool } from "./db";
import { redactSensitiveText } from "./logRedaction";
import { buildMailHtml, sendWorkflowMail } from "./mailRelay";
import { loadSystemSettings, upsertSystemSettings, WORKFLOW_SETTING_KEYS } from "./systemSettings";

export type AdminAlertMinimumLevel = "error" | "warning";

export type AdminAlertSettings = {
  enabled: boolean;
  recipients: string[];
  minimumLevel: AdminAlertMinimumLevel;
  lastSentAt: string | null;
  lastCount: number;
};

export type AdminAlertErrorGroup = {
  level: string;
  errorCode: string;
  message: string;
  requestPath: string | null;
  count: number;
  lastOccurredAt: Date;
};

const emailSchema = z.string().email();
let alertJobRunning = false;

export function normalizeAdminAlertRecipients(values: string[]): string[] {
  const normalized = Array.from(new Set(values.map((value) => value.trim().toLowerCase()).filter(Boolean)));
  if (normalized.length > 20 || normalized.some((value) => value.length > 320 || !emailSchema.safeParse(value).success)) {
    throw new Error("invalid_admin_alert_recipients");
  }
  return normalized;
}

function parseRecipients(raw: string | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) && parsed.every((value) => typeof value === "string")
      ? normalizeAdminAlertRecipients(parsed)
      : [];
  } catch {
    return [];
  }
}

function parsePositiveInteger(value: string | undefined): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

export async function loadAdminAlertSettings(): Promise<AdminAlertSettings> {
  const values = await loadSystemSettings([
    WORKFLOW_SETTING_KEYS.adminAlertEnabled,
    WORKFLOW_SETTING_KEYS.adminAlertRecipients,
    WORKFLOW_SETTING_KEYS.adminAlertMinimumLevel,
    WORKFLOW_SETTING_KEYS.adminAlertLastSentAt,
    WORKFLOW_SETTING_KEYS.adminAlertLastCount
  ]);
  return {
    enabled: values.get(WORKFLOW_SETTING_KEYS.adminAlertEnabled) === "true",
    recipients: parseRecipients(values.get(WORKFLOW_SETTING_KEYS.adminAlertRecipients)),
    minimumLevel: values.get(WORKFLOW_SETTING_KEYS.adminAlertMinimumLevel) === "warning" ? "warning" : "error",
    lastSentAt: values.get(WORKFLOW_SETTING_KEYS.adminAlertLastSentAt)?.trim() || null,
    lastCount: parsePositiveInteger(values.get(WORKFLOW_SETTING_KEYS.adminAlertLastCount))
  };
}

export async function saveAdminAlertSettings(input: {
  enabled: boolean;
  recipients: string[];
  minimumLevel: AdminAlertMinimumLevel;
}, now = new Date()): Promise<AdminAlertSettings> {
  const recipients = normalizeAdminAlertRecipients(input.recipients);
  if (input.enabled && recipients.length === 0) throw new Error("admin_alert_recipient_required");
  const previous = await loadAdminAlertSettings();
  const values: Record<string, string> = {
    [WORKFLOW_SETTING_KEYS.adminAlertEnabled]: String(input.enabled),
    [WORKFLOW_SETTING_KEYS.adminAlertRecipients]: JSON.stringify(recipients),
    [WORKFLOW_SETTING_KEYS.adminAlertMinimumLevel]: input.minimumLevel
  };
  if (input.enabled && !previous.enabled) {
    values[WORKFLOW_SETTING_KEYS.adminAlertLastScanAt] = now.toISOString();
  }
  await upsertSystemSettings(values);
  return { ...previous, enabled: input.enabled, recipients, minimumLevel: input.minimumLevel };
}

function errorLogUrl(): string {
  return `${env.PUBLIC_BASE_URL.replace(/\/+$/, "")}/admin?section=fehler`;
}

export function buildAdminAlertMail(total: number, groups: AdminAlertErrorGroup[]) {
  const heading = `${total} neue ${total === 1 ? "Fehlermeldung" : "Fehlermeldungen"}`;
  const safeGroups = groups.map((group) => ({
    ...group,
    message: redactSensitiveText(group.message),
    requestPath: group.requestPath?.split(/[?#]/, 1)[0] || null
  }));
  const lines = safeGroups.map((group) =>
    `${group.count}× [${group.level}] ${group.errorCode}${group.requestPath ? ` · ${group.requestPath}` : ""}\n${group.message}`
  );
  const omitted = groups.length >= 25 ? "\nEs werden höchstens 25 Fehlergruppen dargestellt." : "";
  return {
    subject: `[Besucher Manager] ${heading}`,
    text: [heading, "", ...lines, omitted, "", `Fehlerprotokoll: ${errorLogUrl()}`].join("\n"),
    html: buildMailHtml({
      heading,
      introduction: "Der Besucher Manager hat neue technische Fehler protokolliert. Gleiche Fehler wurden zusammengefasst.",
      details: safeGroups.map((group) => ({
        label: `${group.count}× ${group.errorCode}`,
        value: `${group.level}${group.requestPath ? ` · ${group.requestPath}` : ""} · ${group.message}`
      })),
      detailUrl: errorLogUrl(),
      detailLinkLabel: "Fehlerprotokoll öffnen"
    })
  };
}

async function loadErrorSummary(since: Date, until: Date, minimumLevel: AdminAlertMinimumLevel): Promise<{ total: number; groups: AdminAlertErrorGroup[] }> {
  const pool = await getPool();
  const levelCondition = minimumLevel === "warning" ? "[level] IN (N'error', N'warning')" : "[level] = N'error'";
  const countResult = await pool.request()
    .input("since", sql.DateTime2, since)
    .input("until", sql.DateTime2, until)
    .query<{ count: number }>(`SELECT COUNT(*) AS count FROM dbo.error_logs WHERE [timestamp] > @since AND [timestamp] <= @until AND ${levelCondition}`);
  const total = countResult.recordset[0]?.count ?? 0;
  if (total === 0) return { total: 0, groups: [] };

  const grouped = await pool.request()
    .input("since", sql.DateTime2, since)
    .input("until", sql.DateTime2, until)
    .query<AdminAlertErrorGroup>(`
      SELECT TOP 25 [level], error_code AS errorCode,
        LEFT(CONVERT(NVARCHAR(1000), [message]), 1000) AS [message],
        request_path AS requestPath, COUNT(*) AS count, MAX([timestamp]) AS lastOccurredAt
      FROM dbo.error_logs
      WHERE [timestamp] > @since AND [timestamp] <= @until AND ${levelCondition}
      GROUP BY [level], error_code, LEFT(CONVERT(NVARCHAR(1000), [message]), 1000), request_path
      ORDER BY COUNT(*) DESC, MAX([timestamp]) DESC
    `);
  return { total, groups: grouped.recordset };
}

export async function runAdminErrorAlertJob(now = new Date()): Promise<number> {
  if (alertJobRunning) return 0;
  alertJobRunning = true;
  try {
    const settings = await loadAdminAlertSettings();
    if (!settings.enabled || settings.recipients.length === 0) return 0;
    const cursor = await loadSystemSettings([WORKFLOW_SETTING_KEYS.adminAlertLastScanAt]);
    const rawSince = cursor.get(WORKFLOW_SETTING_KEYS.adminAlertLastScanAt);
    const since = rawSince ? new Date(rawSince) : null;
    if (!since || Number.isNaN(since.getTime()) || since >= now) {
      await upsertSystemSettings({ [WORKFLOW_SETTING_KEYS.adminAlertLastScanAt]: now.toISOString() });
      return 0;
    }

    const summary = await loadErrorSummary(since, now, settings.minimumLevel);
    if (summary.total === 0) {
      await upsertSystemSettings({ [WORKFLOW_SETTING_KEYS.adminAlertLastScanAt]: now.toISOString() });
      return 0;
    }

    const delivered = await sendWorkflowMail({ to: settings.recipients, ...buildAdminAlertMail(summary.total, summary.groups) });
    if (!delivered) throw new Error("admin_alert_mail_relay_unavailable");
    await upsertSystemSettings({
      [WORKFLOW_SETTING_KEYS.adminAlertLastScanAt]: now.toISOString(),
      [WORKFLOW_SETTING_KEYS.adminAlertLastSentAt]: now.toISOString(),
      [WORKFLOW_SETTING_KEYS.adminAlertLastCount]: String(summary.total)
    });
    return summary.total;
  } finally {
    alertJobRunning = false;
  }
}

export async function sendAdminAlertTest(recipientsInput: string[]): Promise<void> {
  const recipients = normalizeAdminAlertRecipients(recipientsInput);
  if (recipients.length === 0) throw new Error("admin_alert_recipient_required");
  const delivered = await sendWorkflowMail({
    to: recipients,
    subject: "Besucher Manager: Test der Admin-Fehlerbenachrichtigung",
    text: "Die Admin-Fehlerbenachrichtigung wurde erfolgreich getestet. Dies ist keine echte Fehlermeldung.",
    html: buildMailHtml({
      heading: "Test der Admin-Fehlerbenachrichtigung",
      introduction: "Die Admin-Fehlerbenachrichtigung wurde erfolgreich getestet. Dies ist keine echte Fehlermeldung."
    })
  });
  if (!delivered) throw new Error("admin_alert_mail_relay_unavailable");
}
