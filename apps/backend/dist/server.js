"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startServer = startServer;
const node_fs_1 = __importDefault(require("node:fs"));
const app_1 = require("./app");
const env_1 = require("./config/env");
async function startServer() {
    node_fs_1.default.mkdirSync(env_1.env.uploadDir, { recursive: true });
    const app = (0, app_1.createApp)();
    app.listen(env_1.env.APP_PORT, env_1.env.APP_HOST, () => {
        console.log(`besucher-manager listening on http://${env_1.env.APP_HOST}:${env_1.env.APP_PORT}`);
    });
}
if (require.main === module) {
    startServer().catch((error) => {
        console.error(error);
        process.exit(1);
    });
}
