import jwt from "jsonwebtoken";
const getJwtSecret = () => {
    const secret = process.env.JWT_SECRET;
    if (!secret)
        throw new Error("JWT_SECRET environment variable is required");
    return secret;
};
export const authenticateToken = (req, res, next) => {
    console.log("🔐 AUTH HEADER RECEIVED BY SERVER:", req.headers.authorization);
    console.log("📋 ALL HEADERS:", req.headers);
    const authHeader = req.headers["authorization"];
    const token = authHeader && authHeader.split(" ")[1];
    if (!token) {
        return res.status(401).json({
            error: "Access denied",
            code: "NO_TOKEN",
        });
    }
    try {
        const verified = jwt.verify(token, getJwtSecret());
        req.user = verified;
        next();
    }
    catch (err) {
        if (err.name === 'TokenExpiredError') {
            return res.status(401).json({ error: "Session expired. Please sign in again.", code: "TOKEN_EXPIRED" });
        }
        res.status(401).json({ error: "Invalid session. Please sign in again.", code: "INVALID_TOKEN" });
    }
};
export const isAdmin = (req, res, next) => {
    if (req.user && req.user.is_admin) {
        next();
    }
    else {
        res.status(403).json({ error: "Admin access required" });
    }
};
