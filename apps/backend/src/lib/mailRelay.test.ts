import test from "node:test";
import assert from "node:assert/strict";

function loadModule() {
  process.env.APP_SECRET = process.env.APP_SECRET || "test-secret";
  process.env.MSSQL_HOST = process.env.MSSQL_HOST || "localhost";
  process.env.MSSQL_DATABASE = process.env.MSSQL_DATABASE || "testdb";
  process.env.MSSQL_USER = process.env.MSSQL_USER || "sa";
  process.env.MSSQL_PASSWORD = process.env.MSSQL_PASSWORD || "Password123!";

  delete require.cache[require.resolve("../config/env")];
  delete require.cache[require.resolve("./mailRelay")];

  return require("./mailRelay") as typeof import("./mailRelay");
}

test("mergeMailRecipients normalizes and deduplicates addresses", () => {
  const { mergeMailRecipients } = loadModule();

  const recipients = mergeMailRecipients(
    [" SIBE@example.org ", "admin@example.org"],
    ["sibe@example.org", "", "ADMIN@example.org", undefined, null]
  );

  assert.deepEqual(recipients, ["sibe@example.org", "admin@example.org"]);
});

test("visit validity dates keep the stored all-day interval", () => {
  const { formatVisitDate } = loadModule();

  assert.equal(formatVisitDate(new Date("2026-07-30T00:00:00.000Z")), "30.07.2026, 00:00");
  assert.equal(formatVisitDate(new Date("2026-07-30T23:59:59.999Z")), "30.07.2026, 23:59");
});

test("HTML template escapes visitor and free-text values", () => {
  const { buildMailHtml } = loadModule();
  const html = buildMailHtml({
    heading: "Besuch <bestätigt>",
    introduction: "Firma & Zweck",
    details: [{ label: "Besucher", value: "Max <Muster> & Co. \"Test\"" }],
    detailUrl: "https://example.test/?q=<unsafe>"
  });

  assert.match(html, /Besuch &lt;bestätigt&gt;/);
  assert.match(html, /Max &lt;Muster&gt; &amp; Co\. &quot;Test&quot;/);
  assert.doesNotMatch(html, /Max <Muster>/);
  assert.match(html, /href="https:\/\/example\.test\/\?q=&lt;unsafe&gt;"/);
});

test("mail format controls whether Nodemailer receives an HTML alternative", () => {
  const { createMailMessage } = loadModule();
  const request = { to: ["mail@example.test"], subject: "Test", text: "Fallback", html: "<p>HTML</p>" };

  assert.deepEqual(createMailMessage(request, "text"), { subject: "Test", text: "Fallback" });
  assert.deepEqual(createMailMessage(request, "html"), { subject: "Test", text: "Fallback", html: "<p>HTML</p>" });
});

test("mail format defaults to text for missing or invalid settings", () => {
  const { toMailFormat } = require("./systemSettings") as typeof import("./systemSettings");

  assert.equal(toMailFormat(undefined), "text");
  assert.equal(toMailFormat("unexpected"), "text");
  assert.equal(toMailFormat("HTML"), "html");
});

test("visit mail previews provide text and HTML content", () => {
  const { buildMailRelayPreviewContent } = loadModule();

  for (const kind of ["pre_registration", "reminder"] as const) {
    const preview = buildMailRelayPreviewContent(kind);
    assert.match(preview.text, /Max Mustermann/);
    assert.match(preview.html, /Voranmeldung bestätigt|Erinnerung an Ihren Besuch/);
    assert.match(preview.text, /Voranmeldung ansehen und Angaben korrigieren/);
    assert.match(preview.html, /Voranmeldung ansehen und bearbeiten/);
    assert.match(preview.text, /\/visit\/confirmation#/);
    assert.doesNotMatch(preview.text, /\/sibe\/besucher/);
    assert.doesNotMatch(preview.text, /Besuchs-ID/);
  }
});

test("public confirmation link keeps the token out of the request path", () => {
  const { buildPublicConfirmationUrl } = loadModule();
  const token = "A".repeat(43);
  const url = buildPublicConfirmationUrl(token);
  assert.match(url, /\/visit\/confirmation#A{43}$/);
  assert.equal(new URL(url).pathname.includes(token), false);
  assert.equal(new URL(url).hash.slice(1), token);
});
