import sql from "mssql";
import { env } from "../config/env";

let poolPromise: Promise<sql.ConnectionPool> | null = null;

export function getSqlConfig(): sql.config {
  return {
    server: env.MSSQL_HOST,
    port: env.MSSQL_PORT,
    database: env.MSSQL_DATABASE,
    user: env.MSSQL_USER,
    password: env.MSSQL_PASSWORD,
    options: {
      encrypt: env.MSSQL_ENCRYPT,
      trustServerCertificate: env.MSSQL_TRUST_SERVER_CERTIFICATE
    },
    pool: {
      min: 0,
      max: 10,
      idleTimeoutMillis: 30000
    }
  };
}

export async function getPool(): Promise<sql.ConnectionPool> {
  if (!poolPromise) {
    poolPromise = new sql.ConnectionPool(getSqlConfig()).connect().catch((error) => {
      // A failed initial connection must not poison all later attempts. This is
      // essential while SQL Server is starting or reconnecting after an outage.
      poolPromise = null;
      throw error;
    });
  }

  return poolPromise;
}

export async function closePool(): Promise<void> {
  if (!poolPromise) {
    return;
  }

  const pool = await poolPromise;
  await pool.close();
  poolPromise = null;
}
