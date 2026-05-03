require("dotenv").config();
const path = require("path");
const crypto = require("crypto");
const express = require("express");
const fs = require("fs");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const { sign } = require("./utils/crypto");

try {
    sign("__startup_check__");
} catch (e) {
    console.error(e.message);
    process.exit(1);
}

const app = express();
app.disable("x-powered-by");
app.set("trust proxy", 1);
app.use(helmet());
app.use(express.json({ limit: "10kb" }));

const corsOrigin = process.env.CORS_ORIGIN;
app.use(
    cors(
        corsOrigin
            ? { origin: corsOrigin.split(",").map((s) => s.trim()) }
            : { origin: true }
    )
);

const verifyLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 120,
    standardHeaders: true,
    legacyHeaders: false
});

const adminLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false
});

const DB_FILE = path.join(__dirname, "db.json");
const KEY_PATTERN = /^KEY-[A-Z0-9]{8,16}$/;
const USER_ID_PATTERN = /^[0-9]{1,20}$/;

if (process.env.NODE_ENV === "production" && !process.env.ADMIN_API_KEY) {
    console.warn(
        "[SECURITY] ADMIN_API_KEY is unset: POST /create and /toggle are open to anyone."
    );
}

function ensureDBFile() {
    if (!fs.existsSync(DB_FILE)) {
        fs.writeFileSync(DB_FILE, "{}");
    }
}

function randomKey() {
    return "KEY-" + crypto.randomBytes(5).toString("hex").toUpperCase();
}

function isValidUserId(value) {
    return USER_ID_PATTERN.test(String(value ?? ""));
}

function loadDB() {
    ensureDBFile();
    return JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
}

function saveDB(data) {
    const temp = DB_FILE + ".tmp";
    fs.writeFileSync(temp, JSON.stringify(data, null, 2));
    fs.renameSync(temp, DB_FILE);
}

function requireAdmin(req, res, next) {
    const expected = process.env.ADMIN_API_KEY;
    if (!expected) {
        return next();
    }
    const bearer = req.get("authorization");
    const bearerMatch = bearer && /^Bearer\s+(.+)$/i.exec(bearer);
    const fromBearer = bearerMatch ? bearerMatch[1].trim() : null;
    const fromHeader = req.get("x-admin-key");
    const provided = fromBearer || fromHeader;
    if (provided !== expected) {
        return res.status(401).json({ error: "UNAUTHORIZED" });
    }
    next();
}

app.get("/", (req, res) => {
    res.json({ ok: true, service: "roblox-key-api" });
});

app.get("/health", (req, res) => {
    res.json({ ok: true, uptimeSec: Math.round(process.uptime()) });
});

app.get("/verify", verifyLimiter, (req, res) => {
    const { key, userId } = req.query;
    if (!KEY_PATTERN.test(String(key ?? ""))) {
        return res.status(400).json({ valid: false, reason: "BAD_KEY_FORMAT" });
    }
    if (!isValidUserId(userId)) {
        return res.status(400).json({ valid: false, reason: "BAD_USER_ID" });
    }

    const db = loadDB();
    const data = db[key];

    if (!data) {
        return res.json({ valid: false, reason: "NOT_FOUND" });
    }
    if (!data.enabled) {
        return res.json({ valid: false, reason: "DISABLED" });
    }
    if (data.userId && String(data.userId) !== String(userId)) {
        return res.json({ valid: false, reason: "USER_MISMATCH" });
    }
    if (Date.now() > data.expires) {
        return res.json({ valid: false, reason: "EXPIRED" });
    }

    const payload = `${key}:${userId}:${Date.now()}`;
    const signature = sign(payload);
    return res.json({ valid: true, payload, signature, serverTime: Date.now() });
});

app.post("/create", adminLimiter, requireAdmin, (req, res) => {
    const { userId, durationDays } = req.body || {};
    const userIdValue = userId == null ? null : String(userId);
    const days = Number(durationDays ?? 1);

    if (userIdValue !== null && !isValidUserId(userIdValue)) {
        return res.status(400).json({ error: "BAD_USER_ID" });
    }
    if (!Number.isFinite(days) || days < 1 || days > 365) {
        return res.status(400).json({ error: "BAD_DURATION_DAYS" });
    }

    const db = loadDB();
    const key = randomKey();
    db[key] = {
        userId: userIdValue,
        enabled: true,
        expires: Date.now() + Math.floor(days) * 86400000
    };
    saveDB(db);
    res.status(201).json({ success: true, key, expires: db[key].expires });
});

app.post("/toggle", adminLimiter, requireAdmin, (req, res) => {
    const { key } = req.body || {};
    if (!KEY_PATTERN.test(String(key ?? ""))) {
        return res.status(400).json({ error: "BAD_KEY_FORMAT" });
    }
    const db = loadDB();
    if (!db[key]) {
        return res.status(404).json({ error: "NOT_FOUND" });
    }
    db[key].enabled = !db[key].enabled;
    saveDB(db);
    res.json({ success: true, enabled: db[key].enabled });
});

app.use((err, req, res, next) => {
    console.error("[ERROR]", err?.message || err);
    if (res.headersSent) {
        return next(err);
    }
    res.status(500).json({ error: "INTERNAL_ERROR" });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log("API ONLINE ON PORT " + PORT);
});
