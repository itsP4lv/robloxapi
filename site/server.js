const path = require("path");
const express = require("express");

const app = express();

const PUBLIC = path.join(__dirname, "public");
app.use(express.static(PUBLIC, { index: "index.html" }));

app.get("/health", (req, res) => {
    res.json({ ok: true, service: "site" });
});

const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
    console.log("Site static server on port " + PORT);
});
