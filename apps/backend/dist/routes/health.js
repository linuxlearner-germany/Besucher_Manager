"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.healthRouter = void 0;
const express_1 = require("express");
const env_1 = require("../config/env");
exports.healthRouter = (0, express_1.Router)();
function healthResponse() {
    return {
        status: "ok",
        service: "besucher-manager",
        environment: env_1.env.NODE_ENV,
        database: {
            configured: Boolean(env_1.env.MSSQL_HOST && env_1.env.MSSQL_DATABASE && env_1.env.MSSQL_USER)
        }
    };
}
exports.healthRouter.get("/health", (_request, response) => {
    response.json(healthResponse());
});
exports.healthRouter.get("/api/health", (_request, response) => {
    response.json({
        ...healthResponse()
    });
});
