import fs from "node:fs/promises";
import { parse as parseYaml } from "yaml";
import { z } from "zod";
import { env } from "../config/env";

const booleanish = z.preprocess((value) => {
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();

    if (["1", "true", "yes", "on"].includes(normalized)) {
      return true;
    }

    if (["0", "false", "no", "off", ""].includes(normalized)) {
      return false;
    }
  }

  return value;
}, z.boolean());

const optionalString = z.preprocess((value) => {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value);
}, z.string());

const positiveNumber = z.preprocess((value) => {
  if (typeof value === "string" && value.trim().length > 0) {
    return Number.parseInt(value.trim(), 10);
  }

  return value;
}, z.number().int().positive());

const recipientList = z.preprocess((value) => {
  if (Array.isArray(value)) {
    return value.map((entry) => String(entry).trim()).filter(Boolean);
  }

  if (typeof value === "string") {
    return value
      .split(/[,\n;]+/)
      .map((entry) => entry.trim())
      .filter(Boolean);
  }

  return [];
}, z.array(z.string()));

const relayBlockSchema = z.object({
  enabled: booleanish.default(false),
  host: optionalString.default(""),
  port: positiveNumber.default(587),
  secure: booleanish.default(false),
  username: optionalString.default(""),
  password: optionalString.default(""),
  fromAddress: optionalString.default(""),
  from: optionalString.optional(),
  approvalRecipients: recipientList.default([]),
  recipients: recipientList.optional(),
  approvalTo: recipientList.optional(),
  auth: z.object({
    username: optionalString.optional(),
    password: optionalString.optional()
  }).optional()
}).passthrough();

const relayConfigSchema = z.object({
  mailRelay: relayBlockSchema.optional(),
  smtpRelay: relayBlockSchema.optional(),
  smtpOutboundRelay: relayBlockSchema.optional()
}).passthrough();

export type MailRelayFileConfig = {
  source: "yml";
  configPath: string;
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

function normalizeRecipients(values: string[]): string[] {
  return Array.from(new Set(values.map((entry) => entry.trim()).filter(Boolean)));
}

function resolveRelayBlock(rawConfig: z.infer<typeof relayConfigSchema>) {
  return rawConfig.mailRelay ?? rawConfig.smtpRelay ?? rawConfig.smtpOutboundRelay ?? null;
}

export async function loadMailRelayFileConfig(): Promise<MailRelayFileConfig | null> {
  if (!env.mailRelayConfigPath) {
    return null;
  }

  let fileContent: string;
  try {
    fileContent = await fs.readFile(env.mailRelayConfigPath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }
    throw error;
  }

  if (fileContent.trim().length === 0) {
    return null;
  }

  const parsedDocument = relayConfigSchema.parse(parseYaml(fileContent) ?? {});
  const relayBlock = resolveRelayBlock(parsedDocument);

  if (!relayBlock) {
    return null;
  }

  const username = relayBlock.username.trim() || relayBlock.auth?.username?.trim() || "";
  const password = relayBlock.password || relayBlock.auth?.password || "";
  const fromAddress = (relayBlock.fromAddress || relayBlock.from || "").trim();
  const approvalRecipients = normalizeRecipients(
    relayBlock.approvalRecipients.length > 0
      ? relayBlock.approvalRecipients
      : relayBlock.recipients?.length
        ? relayBlock.recipients
        : relayBlock.approvalTo ?? []
  );

  return {
    source: "yml",
    configPath: env.mailRelayConfigPath,
    enabled: relayBlock.enabled,
    host: relayBlock.host.trim(),
    port: relayBlock.port,
    secure: relayBlock.secure,
    username,
    password,
    fromAddress,
    approvalRecipients,
    hasPassword: password.trim().length > 0
  };
}
