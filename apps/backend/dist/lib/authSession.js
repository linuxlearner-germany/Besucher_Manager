"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createSessionToken = createSessionToken;
exports.readSessionToken = readSessionToken;
exports.setSessionCookie = setSessionCookie;
exports.clearSessionCookie = clearSessionCookie;
exports.getSessionCookieName = getSessionCookieName;
const node_crypto_1 = __importDefault(require("node:crypto"));
const env_1 = require("../config/env");
const sessionCookieName = "visitor_manager_session";
const sessionTtlHours = 12;
function toBase64Url(value) {
    return Buffer.from(value, "utf8").toString("base64url");
}
function fromBase64Url(value) {
    return JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
}
function createSignature(payloadSegment) {
    return node_crypto_1.default.createHmac("sha256", env_1.env.APP_SECRET).update(payloadSegment).digest("base64url");
}
function createSessionToken(user) {
    const payload = {
        userId: user.id,
        username: user.username,
        role: user.role,
        gateId: user.gateId,
        exp: Date.now() + sessionTtlHours * 60 * 60 * 1000
    };
    const payloadSegment = toBase64Url(JSON.stringify(payload));
    const signature = createSignature(payloadSegment);
    return `${payloadSegment}.${signature}`;
}
function readSessionToken(token) {
    if (!token) {
        return null;
    }
    const [payloadSegment, providedSignature] = token.split(".");
    if (!payloadSegment || !providedSignature) {
        return null;
    }
    const expectedSignature = createSignature(payloadSegment);
    if (!node_crypto_1.default.timingSafeEqual(Buffer.from(expectedSignature), Buffer.from(providedSignature))) {
        return null;
    }
    const payload = fromBase64Url(payloadSegment);
    if (payload.exp < Date.now()) {
        return null;
    }
    return {
        id: payload.userId,
        username: payload.username,
        role: payload.role,
        gateId: payload.gateId
    };
}
function setSessionCookie(response, user) {
    response.cookie(sessionCookieName, createSessionToken(user), {
        sameSite: "strict",
        secure: env_1.env.APP_SECURE_COOKIES,
        httpOnly: true,
        maxAge: sessionTtlHours * 60 * 60 * 1000
    });
}
function clearSessionCookie(response) {
    response.clearCookie(sessionCookieName, {
        sameSite: "strict",
        secure: env_1.env.APP_SECURE_COOKIES,
        httpOnly: true
    });
}
function getSessionCookieName() {
    return sessionCookieName;
}
