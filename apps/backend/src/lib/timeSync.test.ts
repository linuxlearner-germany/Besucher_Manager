import assert from "node:assert/strict";
import { chmod, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { isValidNtpServer, normalizeNtpServer } from "./ntpClient";

const helper = path.resolve(__dirname, "../../../../scripts/ops/apply_backup_ntp_server.py");

test("accepts DNS NTP hosts and rejects addresses or command input", () => {
  assert.equal(normalizeNtpServer(" Pool.NTP.org. "), "pool.ntp.org");
  assert.equal(isValidNtpServer("pool.ntp.org"), true);
  assert.equal(isValidNtpServer("time.cloudflare.com"), true);
  assert.equal(isValidNtpServer("127.0.0.1"), false);
  assert.equal(isValidNtpServer("localhost"), false);
  assert.equal(isValidNtpServer("pool.ntp.org\nserver attacker.example"), false);
  assert.equal(isValidNtpServer("https://pool.ntp.org"), false);
});

test("host helper applies only the validated source without shell evaluation", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "besucher-ntp-"));
  try {
    const request = path.join(directory, "request.json");
    const source = path.join(directory, "source.sources");
    const status = path.join(directory, "status.json");
    const chronyc = path.join(directory, "chronyc");
    await writeFile(chronyc, "#!/bin/sh\nexit 0\n", "utf8");
    await chmod(chronyc, 0o700);
    await writeFile(request, JSON.stringify({ enabled: true, server: "pool.ntp.org" }), "utf8");

    const applied = spawnSync("python3", [helper, "--request", request, "--source", source, "--status", status, "--chronyc", chronyc], { encoding: "utf8" });
    assert.equal(applied.status, 0, applied.stderr);
    assert.equal(await readFile(source, "utf8"), "server pool.ntp.org iburst\n");
    assert.equal(JSON.parse(await readFile(status, "utf8")).state, "applied");

    await writeFile(request, JSON.stringify({ enabled: true, server: "pool.ntp.org\nserver attacker.example" }), "utf8");
    const rejected = spawnSync("python3", [helper, "--request", request, "--source", source, "--status", status, "--chronyc", chronyc], { encoding: "utf8" });
    assert.equal(rejected.status, 1);
    assert.equal(await readFile(source, "utf8"), "server pool.ntp.org iburst\n");
    assert.equal(JSON.parse(await readFile(status, "utf8")).state, "failed");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("host helper refuses to follow a request-file symlink", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "besucher-ntp-link-"));
  try {
    const actual = path.join(directory, "actual.json");
    const request = path.join(directory, "request.json");
    const source = path.join(directory, "source.sources");
    const status = path.join(directory, "status.json");
    const chronyc = path.join(directory, "chronyc");
    await writeFile(actual, JSON.stringify({ enabled: true, server: "pool.ntp.org" }), "utf8");
    await symlink(actual, request);
    await writeFile(chronyc, "#!/bin/sh\nexit 0\n", "utf8");
    await chmod(chronyc, 0o700);

    const result = spawnSync("python3", [helper, "--request", request, "--source", source, "--status", status, "--chronyc", chronyc], { encoding: "utf8" });
    assert.equal(result.status, 1);
    assert.equal(JSON.parse(await readFile(status, "utf8")).state, "failed");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
