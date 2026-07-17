# SiteGenesis API

## Environment

Copy .env.example to .env and adjust the values.

## Run

```bash
npm install
npm run dev
```

## Health check

```bash
curl http://localhost:3000/health
```

## Roblox integration

The API is ready to receive moderation actions from Discord and expose them to Roblox.

### Required header

All Roblox requests should include:

```bash
curl -H "x-api-key: change-me" http://localhost:3000/api/roblox/moderation/pending
```

### Available endpoints

- GET /api/roblox/moderation/pending
- POST /api/roblox/moderation/:id/processed

### Full Roblox guide

See [ROBLOX_GUIDE.md](ROBLOX_GUIDE.md) for a ready-to-paste server script example.
