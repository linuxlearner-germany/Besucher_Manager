import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

function loadModuleWithConfig(configPath?: string) {
  process.env.APP_SECRET = process.env.APP_SECRET || "test-secret";
  process.env.MSSQL_HOST = process.env.MSSQL_HOST || "localhost";
  process.env.MSSQL_DATABASE = process.env.MSSQL_DATABASE || "testdb";
  process.env.MSSQL_USER = process.env.MSSQL_USER || "sa";
  process.env.MSSQL_PASSWORD = process.env.MSSQL_PASSWORD || "Password123!";

  if (configPath) {
    process.env.MAIL_RELAY_CONFIG_PATH = configPath;
  } else {
    delete process.env.MAIL_RELAY_CONFIG_PATH;
  }

  delete require.cache[require.resolve("../config/env")];
  delete require.cache[require.resolve("./mailRelayFileConfig")];

  return require("./mailRelayFileConfig") as typeof import("./mailRelayFileConfig");
}

test("mail relay YML is parsed as smtp outbound relay config", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "bm-mail-relay-"));
  const configPath = path.join(tempDir, "mail-relay.yml");
  await fs.writeFile(configPath, [
    "smtpOutboundRelay:",
    "  enabled: true",
    "  host: smtp-relay.intern.example",
    "  port: 587",
    "  secure: false",
    "  auth:",
    "    username: relay-user",
    "    password: relay-pass",
    "  from: Besucher Manager <noreply@example.org>"
  ].join("\n"), "utf8");

  const { loadMailRelayFileConfig } = loadModuleWithConfig(configPath);
  const config = await loadMailRelayFileConfig();

  assert.ok(config);
  assert.equal(config.source, "yml");
  assert.equal(config.host, "smtp-relay.intern.example");
  assert.equal(config.port, 587);
  assert.equal(config.secure, false);
  assert.equal(config.username, "relay-user");
  assert.equal(config.password, "relay-pass");
  assert.equal(config.fromAddress, "Besucher Manager <noreply@example.org>");
});

test("missing YML falls back to no relay file config", async () => {
  const { loadMailRelayFileConfig } = loadModuleWithConfig(path.join(os.tmpdir(), "does-not-exist-mail-relay.yml"));
  const config = await loadMailRelayFileConfig();

  assert.equal(config, null);
});
