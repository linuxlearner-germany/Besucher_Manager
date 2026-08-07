import sql from "mssql";
import { generateBadgeNumberCandidate } from "./badgeNumber";
import { VISIT_STATUS } from "./visitWorkflow";

/** Allocates a badge identifier that is not used by an active visit in this transaction. */
export async function generateUniqueBadgeNumber(transaction: sql.Transaction): Promise<string> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const candidate = generateBadgeNumberCandidate();
    const existing = await new sql.Request(transaction)
      .input("badgeNumber", sql.NVarChar(64), candidate)
      .query<{ id: string }>(`
        SELECT TOP 1 v.id
        FROM dbo.visits v
        INNER JOIN dbo.visitors vis ON vis.id = v.visitor_id
        WHERE v.badge_number = @badgeNumber
          AND vis.is_deleted = 0
          AND v.status <> '${VISIT_STATUS.CANCELLED}'
      `);

    if (existing.recordset.length === 0) {
      return candidate;
    }
  }

  throw new Error("badge_number_generation_failed");
}
