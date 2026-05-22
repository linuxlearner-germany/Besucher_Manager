"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = __importDefault(require("node:test"));
const strict_1 = __importDefault(require("node:assert/strict"));
const siteMaps_1 = require("./siteMaps");
(0, node_test_1.default)("site map upload validation only allows expected mime types", () => {
    strict_1.default.equal((0, siteMaps_1.isAllowedSiteMapMimeType)("image/png"), true);
    strict_1.default.equal((0, siteMaps_1.isAllowedSiteMapMimeType)("image/jpeg"), true);
    strict_1.default.equal((0, siteMaps_1.isAllowedSiteMapMimeType)("image/webp"), true);
    strict_1.default.equal((0, siteMaps_1.isAllowedSiteMapMimeType)("image/svg+xml"), false);
    strict_1.default.equal((0, siteMaps_1.isAllowedSiteMapMimeType)("application/pdf"), false);
});
(0, node_test_1.default)("site map upload validation normalizes and restricts extensions", () => {
    strict_1.default.equal((0, siteMaps_1.getNormalizedExtension)("plan.png"), ".png");
    strict_1.default.equal((0, siteMaps_1.getNormalizedExtension)("plan.JPEG"), ".jpg");
    strict_1.default.equal((0, siteMaps_1.getNormalizedExtension)("plan"), null);
    strict_1.default.equal((0, siteMaps_1.isAllowedSiteMapExtension)(".png"), true);
    strict_1.default.equal((0, siteMaps_1.isAllowedSiteMapExtension)(".jpeg"), true);
    strict_1.default.equal((0, siteMaps_1.isAllowedSiteMapExtension)(".svg"), false);
});
(0, node_test_1.default)("stored site map file names never reuse the original name", () => {
    const stored = (0, siteMaps_1.buildStoredSiteMapFileName)(".png");
    strict_1.default.match(stored, /^site-map-\d{13}-[0-9a-f-]{36}\.png$/);
    strict_1.default.equal(stored.includes("plan"), false);
});
