import sql from "mssql";
import { getPool } from "./db";
import { loadMailRelayFileConfig } from "./mailRelayFileConfig";
import { listUiBackgrounds, selectConfiguredUiBackground } from "./uiBackgrounds";

export const WORKFLOW_SETTING_KEYS = {
  relayEnabled: "mail_relay_enabled",
  relayHost: "mail_relay_host",
  relayPort: "mail_relay_port",
  relaySecure: "mail_relay_secure",
  relayUsername: "mail_relay_username",
  relayPassword: "mail_relay_password",
  relayFrom: "mail_relay_from",
  uiBackgroundMode: "ui_background_mode",
  uiBackgroundId: "ui_background_id",
  uiBackgroundImageUrl: "ui_background_image_url",
  uiBackgroundImageName: "ui_background_image_name",
  uiBackgroundImageOriginalFileName: "ui_background_image_original_file_name"
} as const;

export type WorkflowSettings = {
  backgroundMode: "image" | "subtle" | "plain";
  backgroundId: string | null;
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

function toBackgroundMode(value: string | null | undefined, fallback: "image" | "subtle" | "plain"): "image" | "subtle" | "plain" {
  const normalized = value?.trim().toLowerCase();
  if (normalized === "image" || normalized === "subtle" || normalized === "plain") {
    return normalized;
  }
  return fallback;
}

async function loadBackgroundState(settingMap: Map<string, string>): Promise<Pick<WorkflowSettings, "backgroundMode" | "backgroundId" | "backgroundImageUrl" | "backgroundImageName" | "backgroundImageOriginalFileName">> {
  const storedMode = toBackgroundMode(settingMap.get(WORKFLOW_SETTING_KEYS.uiBackgroundMode), "plain");
  const backgroundId = settingMap.get(WORKFLOW_SETTING_KEYS.uiBackgroundId)?.trim() || "";
  const imageUrl = settingMap.get(WORKFLOW_SETTING_KEYS.uiBackgroundImageUrl)?.trim() || "";
  const imageName = settingMap.get(WORKFLOW_SETTING_KEYS.uiBackgroundImageName)?.trim() || "";
  const originalFileName = settingMap.get(WORKFLOW_SETTING_KEYS.uiBackgroundImageOriginalFileName)?.trim() || "";
  const isLegacyDefaultBackground = imageUrl === "/branding/background.png";
  const backgrounds = await listUiBackgrounds().catch(() => []);
  const selectedBackground = selectConfiguredUiBackground(
    backgrounds,
    backgroundId,
    imageUrl,
    originalFileName || imageName
  );

  if (selectedBackground) {
    return {
      backgroundMode: storedMode,
      backgroundId: selectedBackground.id,
      backgroundImageUrl: selectedBackground.imageUrl,
      backgroundImageName: selectedBackground.name,
      backgroundImageOriginalFileName: selectedBackground.fileName
    };
  }

  if (!imageUrl || isLegacyDefaultBackground) {
    return {
      backgroundMode: "plain",
      backgroundId: null,
      backgroundImageUrl: "",
      backgroundImageName: null,
      backgroundImageOriginalFileName: null
    };
  }

  return {
    backgroundMode: storedMode,
    backgroundId: backgroundId || null,
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

  const backgroundState = await loadBackgroundState(settingMap);

  if (fileRelayConfig) {
    return {
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
        hasPassword: fileRelayConfig.hasPassword
      }
    };
  }

  return {
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
