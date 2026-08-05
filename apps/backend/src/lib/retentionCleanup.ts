import sql from "mssql";
import { getPool } from "./db";
import { loadSystemSettings, upsertSystemSettings } from "./systemSettings";

const SETTING_KEYS = ["visit_retention_enabled", "visit_retention_years", "visit_retention_last_run"] as const;
export const RETENTION_BATCH_SIZE = 500;

export type RetentionSettings = {
  enabled: boolean;
  years: number;
  lastRun: string | null;
};

function parseBoolean(value: string | undefined): boolean { return ["1", "true", "yes", "on"].includes((value || "").toLowerCase()); }

export async function loadRetentionSettings(): Promise<RetentionSettings> {
  const values = await loadSystemSettings([...SETTING_KEYS]);
  const years = Number.parseInt(values.get("visit_retention_years") || "10", 10);
  return { enabled: parseBoolean(values.get("visit_retention_enabled")), years: Number.isFinite(years) && years >= 1 ? years : 10, lastRun: values.get("visit_retention_last_run") || null };
}

function cutoffDate(years: number): Date {
  const cutoff = new Date();
  cutoff.setUTCFullYear(cutoff.getUTCFullYear() - years);
  return cutoff;
}

export async function countOldVisits(years: number): Promise<number> {
  const pool = await getPool();
  const result = await pool.request().input("cutoff", sql.DateTime2, cutoffDate(years)).query<{ total: number }>(`
    SELECT COUNT(*) AS total FROM dbo.visits
    WHERE status IN ('checked_out', 'cancelled', 'rejected')
      AND COALESCE(check_out_at, rejected_at, cancelled_at, valid_until) < @cutoff
  `);
  return result.recordset[0]?.total ?? 0;
}

export async function deleteOldVisits(years: number): Promise<{ visits: number; visitors: number }> {
  const pool = await getPool();
  const cutoff = cutoffDate(years);
  let deletedVisits = 0;
  let deletedVisitors = 0;

  while (true) {
    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    try {
      const old = await new sql.Request(transaction)
        .input("cutoff", sql.DateTime2, cutoff)
        .input("batchSize", sql.Int, RETENTION_BATCH_SIZE)
        .query<{ id: string; visitorId: string }>(`
          SELECT TOP (@batchSize) id, visitor_id AS visitorId
          FROM dbo.visits WITH (UPDLOCK, READPAST, ROWLOCK)
          WHERE status IN ('checked_out', 'cancelled', 'rejected')
            AND COALESCE(check_out_at, rejected_at, cancelled_at, valid_until) < @cutoff
          ORDER BY COALESCE(check_out_at, rejected_at, cancelled_at, valid_until), id
        `);

      if (!old.recordset.length) {
        await transaction.commit();
        break;
      }

      const ids = old.recordset.map((row) => row.id);
      const visitorIds = Array.from(new Set(old.recordset.map((row) => row.visitorId)));
      const idList = ids.map((_, index) => `@visit${index}`).join(", ");
      const visitorList = visitorIds.map((_, index) => `@visitor${index}`).join(", ");
      const deleteRequest = new sql.Request(transaction);
      ids.forEach((id, index) => deleteRequest.input(`visit${index}`, sql.UniqueIdentifier, id));
      visitorIds.forEach((id, index) => deleteRequest.input(`visitor${index}`, sql.UniqueIdentifier, id));

      const deleted = await deleteRequest.query<{ entity: "visit" | "visitor"; id: string }>(`
        IF OBJECT_ID('dbo.visit_custom_field_values', 'U') IS NOT NULL
          DELETE FROM dbo.visit_custom_field_values WHERE visit_id IN (${idList});
        IF OBJECT_ID('dbo.nationality_notification_deliveries', 'U') IS NOT NULL
          DELETE FROM dbo.nationality_notification_deliveries WHERE visit_id IN (${idList});

        DECLARE @deletedEntities TABLE (entity NVARCHAR(16), id UNIQUEIDENTIFIER);
        DELETE FROM dbo.visits
          OUTPUT 'visit', deleted.id INTO @deletedEntities(entity, id)
          WHERE id IN (${idList});
        DELETE FROM dbo.visitors
          OUTPUT 'visitor', deleted.id INTO @deletedEntities(entity, id)
          WHERE id IN (${visitorList})
            AND NOT EXISTS (SELECT 1 FROM dbo.visits WHERE visitor_id = dbo.visitors.id);
        SELECT entity, id FROM @deletedEntities;
      `);

      await transaction.commit();
      deletedVisits += deleted.recordset.filter((row) => row.entity === "visit").length;
      deletedVisitors += deleted.recordset.filter((row) => row.entity === "visitor").length;
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }

  return { visits: deletedVisits, visitors: deletedVisitors };
}

export async function runRetentionCleanup(force = false): Promise<{ visits: number; visitors: number }> {
  const settings = await loadRetentionSettings();
  if (!force && !settings.enabled) return { visits: 0, visitors: 0 };
  const result = await deleteOldVisits(settings.years);
  await upsertSystemSettings({ "visit_retention_last_run": new Date().toISOString() });
  return result;
}
