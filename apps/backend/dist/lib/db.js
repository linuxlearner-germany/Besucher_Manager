"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSqlConfig = getSqlConfig;
exports.getPool = getPool;
exports.closePool = closePool;
const mssql_1 = __importDefault(require("mssql"));
const env_1 = require("../config/env");
let poolPromise = null;
function getSqlConfig() {
    return {
        server: env_1.env.MSSQL_HOST,
        port: env_1.env.MSSQL_PORT,
        database: env_1.env.MSSQL_DATABASE,
        user: env_1.env.MSSQL_USER,
        password: env_1.env.MSSQL_PASSWORD,
        options: {
            encrypt: env_1.env.MSSQL_ENCRYPT,
            trustServerCertificate: env_1.env.MSSQL_TRUST_SERVER_CERTIFICATE
        },
        pool: {
            min: 0,
            max: 10,
            idleTimeoutMillis: 30000
        }
    };
}
async function getPool() {
    if (!poolPromise) {
        poolPromise = new mssql_1.default.ConnectionPool(getSqlConfig()).connect();
    }
    return poolPromise;
}
async function closePool() {
    if (!poolPromise) {
        return;
    }
    const pool = await poolPromise;
    await pool.close();
    poolPromise = null;
}
