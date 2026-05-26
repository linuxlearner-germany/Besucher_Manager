"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = __importDefault(require("node:test"));
const strict_1 = __importDefault(require("node:assert/strict"));
const badgeNumber_1 = require("./badgeNumber");
(0, node_test_1.default)("badge number candidate uses exactly 5 uppercase alphanumeric characters", () => {
    const pattern = /^[A-Z0-9]{5}$/;
    for (let index = 0; index < 200; index += 1) {
        const candidate = (0, badgeNumber_1.generateBadgeNumberCandidate)();
        strict_1.default.equal(candidate.length, 5);
        strict_1.default.equal(pattern.test(candidate), true);
        strict_1.default.equal(candidate.includes("-"), false);
        strict_1.default.equal(candidate.startsWith("B-"), false);
        strict_1.default.equal(candidate.includes("LEGACY"), false);
    }
});
