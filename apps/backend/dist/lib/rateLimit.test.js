"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = __importDefault(require("node:test"));
const strict_1 = __importDefault(require("node:assert/strict"));
const rateLimit_1 = require("./rateLimit");
(0, node_test_1.default)("rate limit allows requests up to the configured limit", () => {
    const key = `test-key-${Date.now()}-allow`;
    const first = (0, rateLimit_1.checkRateLimit)(key, 2, 60);
    const second = (0, rateLimit_1.checkRateLimit)(key, 2, 60);
    strict_1.default.equal(first.allowed, true);
    strict_1.default.equal(second.allowed, true);
    strict_1.default.equal(second.remaining, 0);
});
(0, node_test_1.default)("rate limit blocks requests over the configured limit", () => {
    const key = `test-key-${Date.now()}-block`;
    (0, rateLimit_1.checkRateLimit)(key, 1, 60);
    const blocked = (0, rateLimit_1.checkRateLimit)(key, 1, 60);
    strict_1.default.equal(blocked.allowed, false);
    strict_1.default.ok(blocked.retryAfterSeconds >= 1);
});
