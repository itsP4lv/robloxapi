const crypto = require("crypto");

function getSecret() {
    const secret = process.env.HMAC_SECRET;
    if (!secret || typeof secret !== "string" || secret.length < 16) {
        throw new Error(
            "Set HMAC_SECRET in the environment (min 16 characters). Never commit secrets to the repo."
        );
    }
    return secret;
}

function sign(data) {
    return crypto.createHmac("sha256", getSecret()).update(data).digest("hex");
}

module.exports = { sign };
