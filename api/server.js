require("dotenv").config();
const express = require("express");
const fs = require("fs");
const cors = require("cors");
const { sign } = require("./utils/crypto");

try {
    sign("__startup_check__");
} catch (e) {
    console.error(e.message);
    process.exit(1);
}

const app = express();
app.use(express.json());

const corsOrigin = process.env.CORS_ORIGIN;
app.use(
    cors(
        corsOrigin
            ? { origin: corsOrigin.split(",").map((s) => s.trim()) }
            : { origin: true }
    )
);

const DB_FILE = "./db.json";

if (process.env.NODE_ENV === "production" && !process.env.ADMIN_API_KEY) {
    console.warn(
        "[SECURITY] ADMIN_API_KEY is unset: POST /create and /toggle are open to anyone."
    );
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

/* ================= LOAD DB ================= */

function loadDB() {
    return JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
}

function saveDB(data) {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

/* ================= VERIFY KEY ================= */

app.get("/verify", (req, res) => {
    const { key, userId } = req.query;

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

    return res.json({
        valid: true,
        payload,
        signature,
        serverTime: Date.now()
    });
});

/* ================= CREATE KEY ================= */

app.post("/create", requireAdmin, (req, res) => {
    const { userId, durationDays } = req.body;

    const db = loadDB();
    const key = "KEY-" + Math.random().toString(36).substring(2, 10).toUpperCase();

    db[key] = {
        userId: userId != null ? userId : null,
        enabled: true,
        expires: Date.now() + (durationDays || 1) * 86400000
    };

    saveDB(db);

    res.json({ success: true, key });
});

/* ================= TOGGLE KEY ================= */

app.post("/toggle", requireAdmin, (req, res) => {
    const { key } = req.body;

    const db = loadDB();

    if (!db[key]) {
        return res.json({ error: "NOT_FOUND" });
    }

    db[key].enabled = !db[key].enabled;

    saveDB(db);

    res.json({ success: true, enabled: db[key].enabled });
});

/* ================= START ================= */

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log("API ONLINE ON PORT " + PORT);
});
