import sql from "mssql";
import { getPool } from "./db";
import { loadMailRelayFileConfig } from "./mailRelayFileConfig";

export const WORKFLOW_SETTING_KEYS = {
  approvalRequired: "sibe_approval_required",
  relayEnabled: "mail_relay_enabled",
  relayHost: "mail_relay_host",
  relayPort: "mail_relay_port",
  relaySecure: "mail_relay_secure",
  relayUsername: "mail_relay_username",
  relayPassword: "mail_relay_password",
  relayFrom: "mail_relay_from",
  relayApprovalTo: "mail_relay_approval_to",
  uiBackgroundMode: "ui_background_mode",
  uiBackgroundImageUrl: "ui_background_image_url",
  uiBackgroundImageName: "ui_background_image_name",
  uiBackgroundImageOriginalFileName: "ui_background_image_original_file_name"
} as const;

export type WorkflowSettings = {
  approvalRequired: boolean;
  backgroundMode: "image" | "subtle" | "plain";
  backgroundImageUrl: string;
  backgroundImageName: string | null;
  backgroundImageOriginalFileName: string | null;
  emailRelay: {
    source: "database" | "yml";
    configPath: string | null;
    isReadOnly: boolean;
    enabled: boolean;
    host: string;
    port: number;
    secure: boolean;
    username: string;
    password: string;
    fromAddress: string;
    approvalRecipients: string[];
    hasPassword: boolean;
  };
};

type SettingRow = {
  key: string;
  value: string;
};

function toBoolean(value: string | null | undefined, fallback: boolean): boolean {
  if (typeof value !== "string") {
    return fallback;
  }

  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }
  return fallback;
}

function toNumber(value: string | null | undefined, fallback: number): number {
  const parsed = Number.parseInt(value?.trim() || "", 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}

function splitRecipients(value: string | null | undefined): string[] {
  if (typeof value !== "string") {
    return [];
  }

  return Array.from(
    new Set(
      value
        .split(/[,\n;]+/)
        .map((entry) => entry.trim())
        .filter(Boolean)
    )
  );
}

function toBackgroundMode(value: string | null | undefined, fallback: "image" | "subtle" | "plain"): "image" | "subtle" | "plain" {
  const normalized = value?.trim().toLowerCase();
  if (normalized === "image" || normalized === "subtle" || normalized === "plain") {
    return normalized;
  }
  return fallback;
}

function loadBackgroundState(settingMap: Map<string, string>): Pick<WorkflowSettings, "backgroundMode" | "backgroundImageUrl" | "backgroundImageName" | "backgroundImageOriginalFileName"> {
  const storedMode = toBackgroundMode(settingMap.get(WORKFLOW_SETTING_KEYS.uiBackgroundMode), "plain");
  const imageUrl = settingMap.get(WORKFLOW_SETTING_KEYS.uiBackgroundImageUrl)?.trim() || "";
  const imageName = settingMap.get(WORKFLOW_SETTING_KEYS.uiBackgroundImageName)?.trim() || "";
  const originalFileName = settingMap.get(WORKFLOW_SETTING_KEYS.uiBackgroundImageOriginalFileName)?.trim() || "";
  const isLegacyDefaultBackground = imageUrl === "/branding/background.png";

  if (storedMode === "plain" || !imageUrl || isLegacyDefaultBackground) {
    return {
      backgroundMode: "plain",
      backgroundImageUrl: "",
      backgroundImageName: null,
      backgroundImageOriginalFileName: null
    };
  }

  return {
    backgroundMode: storedMode,
    backgroundImageUrl: imageUrl,
    backgroundImageName: imageName || null,
    backgroundImageOriginalFileName: originalFileName || null
  };
}

export async function loadSystemSettings(keys: string[], transaction?: sql.Transaction): Promise<Map<string, string>> {
  if (keys.length === 0) {
    return new Map();
  }

  const request = transaction ? new sql.Request(transaction) : (await getPool()).request();
  const placeholders: string[] = [];

  keys.forEach((key, index) => {
    const name = `key${index}`;
    request.input(name, sql.NVarChar(120), key);
    placeholders.push(`@${name}`);
  });

  const result = await request.query<SettingRow>(`
    SELECT [key] AS [key], [value] AS [value]
    FROM dbo.system_settings
    WHERE [key] IN (${placeholders.join(", ")})
  `);

  return new Map(result.recordset.map((row) => [row.key, row.value]));
}

export async function loadWorkflowSettings(options?: {
  includeSecrets?: boolean;
  transaction?: sql.Transaction;
}): Promise<WorkflowSettings> {
  const settingMap = await loadSystemSettings(Object.values(WORKFLOW_SETTING_KEYS), options?.transaction);
  const password = settingMap.get(WORKFLOW_SETTING_KEYS.relayPassword)?.trim() || "";
  let fileRelayConfig: Awaited<ReturnType<typeof loadMailRelayFileConfig>> = null;

  try {
    fileRelayConfig = await loadMailRelayFileConfig();
  } catch (error) {
    console.error("Mail relay YML could not be loaded, falling back to database settings.", error);
  }

  const backgroundState = loadBackgroundState(settingMap);

  if (fileRelayConfig) {
    return {
      approvalRequired: toBoolean(settingMap.get(WORKFLOW_SETTING_KEYS.approvalRequired), true),
      ...backgroundState,
      emailRelay: {
        source: "yml",
        configPath: fileRelayConfig.configPath,
        isReadOnly: true,
        enabled: fileRelayConfig.enabled,
        host: fileRelayConfig.host,
        port: fileRelayConfig.port,
        secure: fileRelayConfig.secure,
        username: fileRelayConfig.username,
        password: options?.includeSecrets ? fileRelayConfig.password : "",
        fromAddress: fileRelayConfig.fromAddress,
        approvalRecipients: fileRelayConfig.approvalRecipients,
        hasPassword: fileRelayConfig.hasPassword
      }
    };
  }

  return {
    approvalRequired: toBoolean(settingMap.get(WORKFLOW_SETTING_KEYS.approvalRequired), true),
    ...backgroundState,
    emailRelay: {
      source: "database",
      configPath: null,
      isReadOnly: false,
      enabled: toBoolean(settingMap.get(WORKFLOW_SETTING_KEYS.relayEnabled), false),
      host: settingMap.get(WORKFLOW_SETTING_KEYS.relayHost)?.trim() || "",
      port: toNumber(settingMap.get(WORKFLOW_SETTING_KEYS.relayPort), 587),
      secure: toBoolean(settingMap.get(WORKFLOW_SETTING_KEYS.relaySecure), false),
      username: settingMap.get(WORKFLOW_SETTING_KEYS.relayUsername)?.trim() || "",
      password: options?.includeSecrets ? password : "",
      fromAddress: settingMap.get(WORKFLOW_SETTING_KEYS.relayFrom)?.trim() || "",
      approvalRecipients: splitRecipients(settingMap.get(WORKFLOW_SETTING_KEYS.relayApprovalTo)),
      hasPassword: password.length > 0
    }
  };
}

export async function upsertSystemSettings(
  values: Record<string, string>,
  transaction?: sql.Transaction
): Promise<void> {
  const requestFactory = async () => (transaction ? new sql.Request(transaction) : (await getPool()).request());

  for (const [key, value] of Object.entries(values)) {
    const request = await requestFactory();
    await request
      .input("key", sql.NVarChar(120), key)
      .input("value", sql.NVarChar(sql.MAX), value)
      .query(`
        MERGE dbo.system_settings AS target
        USING (SELECT @key AS [key], @value AS [value]) AS source
        ON target.[key] = source.[key]
        WHEN MATCHED THEN
          UPDATE SET [value] = source.[value], updated_at = SYSUTCDATETIME()
        WHEN NOT MATCHED THEN
          INSERT ([key], [value]) VALUES (source.[key], source.[value]);
      `);
  }
}
