import { URL } from "url";
// Private/internal IP ranges that should never be accessed
const PRIVATE_RANGES = [
    /^127\./, // loopback
    /^10\./, // Class A private
    /^172\.(1[6-9]|2\d|3[01])\./, // Class B private
    /^192\.168\./, // Class C private
    /^169\.254\./, // link-local
    /^0\./, // current network
    /^fc00:/i, // IPv6 unique local
    /^fe80:/i, // IPv6 link-local
    /^::1$/, // IPv6 loopback
    /^localhost$/i,
    /^metadata\.google\.internal$/i,
    /^169\.254\.169\.254$/, // cloud metadata
];
export const isPrivateUrl = (urlString) => {
    try {
        const parsed = new URL(urlString);
        const hostname = parsed.hostname;
        return PRIVATE_RANGES.some(r => r.test(hostname));
    }
    catch {
        return true; // Invalid URLs are rejected
    }
};
// Middleware: scans request body for URL fields and blocks private ones
export const ssrfProtection = (req, res, next) => {
    if (["GET", "HEAD", "OPTIONS"].includes(req.method))
        return next();
    const body = req.body;
    if (!body || typeof body !== "object")
        return next();
    const urlFields = ["url", "image", "imageUrl", "callback_url", "webhook"];
    for (const field of urlFields) {
        const val = body[field];
        if (typeof val === "string" && (val.startsWith("http://") || val.startsWith("https://"))) {
            if (isPrivateUrl(val)) {
                return res.status(400).json({ error: "Invalid URL: internal addresses are not allowed" });
            }
        }
    }
    next();
};
