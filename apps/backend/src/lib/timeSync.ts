import fs from "node:fs/promises";
import path from "node:path";
import { env } from "../config/env";
import { isValidNtpServer, normalizeNtpServer } from "./ntpClient";
import { loadSystemSettings, upsertSystemSettings, WORKFLOW_SETTING_KEYS } from "./systemSettings";

export type TimeSyncStatus = {
  state: "applied" | "failed";
  server: string;
  enabled: boolean;
  message: string;
  appliedAt: string;
};

export type TimeSyncSettings = {
  enabled: boolean;
  server: string;
  status: TimeSyncStatus | null;
};

async function readStatus(): Promise<TimeSyncStatus | null> {
  try {
    const raw = await fs.readFile(`${env.timeSyncRequestPath}.status.json`, "utf8");
    const parsed = JSON.parse(raw) as Partial<TimeSyncStatus>;
    if ((parsed.state !== "applied" && parsed.state !== "failed")
      || typeof parsed.server !== "string"
      || typeof parsed.enabled !== "boolean"
      || typeof parsed.message !== "string"
      || typeof parsed.appliedAt !== "string") return null;
    return parsed as TimeSyncStatus;
  } catch {
    return null;
  }
}

export async function loadTimeSyncSettings(): Promise<TimeSyncSettings> {
  const settings = await loadSystemSettings([
    WORKFLOW_SETTING_KEYS.backupNtpEnabled,
    WORKFLOW_SETTING_KEYS.backupNtpServer
  ]);
  const enabled = settings.get(WORKFLOW_SETTING_KEYS.backupNtpEnabled) === "true";
  const server = settings.get(WORKFLOW_SETTING_KEYS.backupNtpServer)?.trim() || "";
  const status = await readStatus();
  return {
    enabled,
    server,
    status: status?.enabled === enabled && status.server === server ? status : null
  };
}

async function writeRequest(enabled: boolean, server: string): Promise<void> {
  const target = env.timeSyncRequestPath;
  await fs.mkdir(path.dirname(target), { recursive: true });
  const temporary = `${target}.${process.pid}.${Date.now()}.tmp`;
  const payload = `${JSON.stringify({ enabled, server, requestedAt: new Date().toISOString() })}\n`;
  await fs.writeFile(temporary, payload, { encoding: "utf8", mode: 0o600, flag: "wx" });
  await fs.rename(temporary, target);
}

export async function saveTimeSyncSettings(enabled: boolean, serverInput: string): Promise<TimeSyncSettings> {
  const server = normalizeNtpServer(serverInput);
  if ((enabled || server) && !isValidNtpServer(server)) throw new Error("invalid_ntp_server");
  await upsertSystemSettings({
    [WORKFLOW_SETTING_KEYS.backupNtpEnabled]: String(enabled),
    [WORKFLOW_SETTING_KEYS.backupNtpServer]: server
  });
  await writeRequest(enabled, server);
  return { enabled, server, status: null };
}
