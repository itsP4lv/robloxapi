# Roblox Key System (API + Site)

Monorepo with:
- `api/`: Node.js key API (Render-ready)
- `site/`: simple static website/server

## 1) Quick Deploy (Render API)

1. Connect this GitHub repo to Render.
2. Create a Web Service.
3. Use:
   - Root Directory: `api`
   - Build Command: `npm install`
   - Start Command: `npm start`
4. Add env vars:
   - `HMAC_SECRET` (required, long random value)
   - `ADMIN_API_KEY` (strongly recommended)
   - `CORS_ORIGIN` (optional, front-end origins)
5. Deploy.

If your Render service still builds from repository root, this repo also has a root `package.json` shim that proxies install/start to `api`.

## 2) Local Setup

```bash
cd api
cp .env.example .env
# fill HMAC_SECRET and optional ADMIN_API_KEY
npm install
npm start
```

API default local URL: `http://localhost:3000`

## 3) Main API Endpoints

- `GET /health` -> API health status
- `GET /verify?key=KEY-XXXXXXXXXX&userId=123456`
- `POST /create` (admin-protected if `ADMIN_API_KEY` is set)
- `POST /toggle` (admin-protected if `ADMIN_API_KEY` is set)

### cURL examples

```bash
curl "https://your-api.onrender.com/verify?key=KEY-ABCDEF12&userId=123456"
```

```bash
curl -X POST "https://your-api.onrender.com/create" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ADMIN_API_KEY" \
  -d '{"userId":"123456","durationDays":7}'
```

```bash
curl -X POST "https://your-api.onrender.com/toggle" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ADMIN_API_KEY" \
  -d '{"key":"KEY-ABCDEF12"}'
```

## 4) Security Included

- `HMAC_SECRET` required at startup (API exits if missing/weak)
- `ADMIN_API_KEY` gate for create/toggle routes
- `helmet` security headers
- JSON body size limit (`10kb`)
- Rate limiting:
  - `/verify`: 120 req/min/IP
  - admin endpoints: 20 req/min/IP
- Input validation for key/userId/duration
- Atomic DB writes (`db.json.tmp` -> rename)
- `x-powered-by` disabled
- CORS allowlist support via `CORS_ORIGIN`
- `.env`, logs, and `node_modules` excluded in `.gitignore`

## 5) Discord Bot: Create Keys via Slash Command

The API folder includes `api/discord-bot.js`.

### Features
- Registers slash command `/createkey`
- Calls your API `/create` endpoint using admin key
- Returns key + expiration in Discord (ephemeral reply)

### Setup

1. Create a Discord app + bot in Discord Developer Portal.
2. Invite the bot to your server with `applications.commands` + bot scope.
3. Add to `api/.env`:
   - `API_BASE_URL=https://your-api.onrender.com`
   - `ADMIN_API_KEY=...` (same as API)
   - `DISCORD_BOT_TOKEN=...`
   - `DISCORD_APPLICATION_ID=...`
   - `DISCORD_GUILD_ID=...` (server ID for guild command registration)
4. Run:

```bash
cd api
npm run bot
```

Use `/createkey userid:123456 days:7` in your Discord server.

## 6) Hardening Checklist (Recommended)

- Rotate `HMAC_SECRET` and `ADMIN_API_KEY` periodically
- Keep `ADMIN_API_KEY` private and never hardcode it client-side
- Restrict `CORS_ORIGIN` to trusted domains only
- Store `db.json` persistently (disk volume or migrate to real DB)
- Add monitoring alerts for repeated 401/429 responses
- Back up keys before major deploys
