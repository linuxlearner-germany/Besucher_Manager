"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createApp = createApp;
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const cookie_parser_1 = __importDefault(require("cookie-parser"));
const express_1 = __importDefault(require("express"));
const helmet_1 = __importDefault(require("helmet"));
const env_1 = require("./config/env");
const api_1 = require("./routes/api");
const health_1 = require("./routes/health");
function resolveFrontendDist() {
    return node_path_1.default.resolve(__dirname, "../../frontend/dist");
}
function createApp() {
    const app = (0, express_1.default)();
    const frontendDist = resolveFrontendDist();
    app.disable("x-powered-by");
    if (env_1.env.appTrustProxy !== undefined) {
        app.set("trust proxy", env_1.env.appTrustProxy);
    }
    app.use((0, helmet_1.default)({
        contentSecurityPolicy: false
    }));
    app.use(express_1.default.json({ limit: "1mb" }));
    app.use(express_1.default.urlencoded({ extended: false }));
    app.use((0, cookie_parser_1.default)(env_1.env.APP_SECRET));
    app.use(health_1.healthRouter);
    app.use(api_1.apiRouter);
    app.use("/uploads", express_1.default.static(env_1.env.uploadDir));
    if (node_fs_1.default.existsSync(frontendDist)) {
        app.use(express_1.default.static(frontendDist));
        app.get("*", (request, response, next) => {
            if (request.path.startsWith("/api") || request.path === "/health" || request.path.startsWith("/uploads")) {
                return next();
            }
            response.sendFile(node_path_1.default.join(frontendDist, "index.html"));
        });
    }
    return app;
}
