import assert from "node:assert/strict";
import test from "node:test";
import { PDFDocument } from "pdf-lib";
import { parseSimplifiedVisitorRulePdf } from "./simplifiedVisitorRulePdf";

async function buildRulePdf(values: Record<string, string>): Promise<Buffer> {
  const document = await PDFDocument.create();
  const form = document.getForm();
  for (const [name, value] of Object.entries(values)) {
    form.createTextField(name).setText(value);
  }
  return Buffer.from(await document.save());
}

test("reads visitors and event details from a simplified visitor rule PDF", async () => {
  const pdf = await buildRulePdf({
    "Bezeichnung der Veranstaltung": "Tag der offenen Tür",
    "Veranstaltende verantwortliche OrgEinheit": "WIWeB",
    "Veranstaltungsort zB Gebäude Raum": "Gebäude 3",
    "Verantwortliche Ansprechpersonen": "Max Muster",
    "Telefonische Erreichbarkeit": "01234 5678",
    "Datum am/vom": "12.08.2026",
    "Datum bis": "13.08.2026",
    "Name zuerst Name dann ggf DstGrTitel oä1": "Muster",
    Vorname1: "Erika",
    "Ggf Firma  Behörde  OrgEinh Verein  Verband usw1": "Muster GmbH"
  });

  const preview = await parseSimplifiedVisitorRulePdf(pdf, "Vereinf_BesRegelung.pdf");

  assert.equal(preview.documentType, "event");
  assert.equal(preview.validFrom, "2026-08-12");
  assert.equal(preview.validUntil, "2026-08-13");
  assert.equal(preview.visitors.length, 1);
  assert.equal(preview.visitors[0]?.lastName, "Muster");
  assert.equal(preview.visitors[0]?.firstName, "Erika");
  assert.equal(preview.visitors[0]?.company, "Muster GmbH");
});

test("recognizes the construction variant from its filename", async () => {
  const pdf = await buildRulePdf({ "Bezeichnung der Veranstaltung": "Hallenumbau" });
  const preview = await parseSimplifiedVisitorRulePdf(pdf, "Vereinf_BesRegelung_BauMaßn_LgschWIWeB.pdf");
  assert.equal(preview.documentType, "construction");
});
