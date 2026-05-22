"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ALLOWED_SITE_MAP_EXTENSIONS = exports.ALLOWED_SITE_MAP_MIME_TYPES = exports.SITE_MAP_MAX_FILE_SIZE_BYTES = exports.SITE_MAP_UPLOAD_SUBDIRECTORY = void 0;
exports.isAllowedSiteMapMimeType = isAllowedSiteMapMimeType;
exports.isAllowedSiteMapExtension = isAllowedSiteMapExtension;
exports.getNormalizedExtension = getNormalizedExtension;
exports.buildStoredSiteMapFileName = buildStoredSiteMapFileName;
exports.buildSiteMapPublicPath = buildSiteMapPublicPath;
const node_path_1 = __importDefault(require("node:path"));
const node_crypto_1 = __importDefault(require("node:crypto"));
exports.SITE_MAP_UPLOAD_SUBDIRECTORY = "site-maps";
exports.SITE_MAP_MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
exports.ALLOWED_SITE_MAP_MIME_TYPES = [
    "image/png",
    "image/jpeg",
    "image/webp"
];
exports.ALLOWED_SITE_MAP_EXTENSIONS = [".png", ".jpg", ".jpeg", ".webp"];
function isAllowedSiteMapMimeType(value) {
    return exports.ALLOWED_SITE_MAP_MIME_TYPES.includes(value);
}
function isAllowedSiteMapExtension(value) {
    return exports.ALLOWED_SITE_MAP_EXTENSIONS.includes(value.toLowerCase());
}
function getNormalizedExtension(fileName) {
    const extension = node_path_1.default.extname(fileName).toLowerCase();
    if (!extension) {
        return null;
    }
    if (extension === ".jpeg") {
        return ".jpg";
    }
    return extension;
}
function buildStoredSiteMapFileName(extension) {
    return `site-map-${Date.now()}-${node_crypto_1.default.randomUUID()}${extension}`;
}
function buildSiteMapPublicPath(storedFileName) {
    return `/uploads/${exports.SITE_MAP_UPLOAD_SUBDIRECTORY}/${storedFileName}`;
}
