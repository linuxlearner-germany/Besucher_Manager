"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkRateLimit = checkRateLimit;
const buckets = new Map();
function checkRateLimit(key, limit, windowSeconds) {
    const now = Date.now();
    const windowMs = windowSeconds * 1000;
    const bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
        buckets.set(key, {
            count: 1,
            resetAt: now + windowMs
        });
        return {
            allowed: true,
            remaining: Math.max(limit - 1, 0),
            retryAfterSeconds: windowSeconds
        };
    }
    bucket.count += 1;
    return {
        allowed: bucket.count <= limit,
        remaining: Math.max(limit - bucket.count, 0),
        retryAfterSeconds: Math.max(Math.ceil((bucket.resetAt - now) / 1000), 1)
    };
}
