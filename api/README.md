example for what to do and how to make it work although i will probably use pm2 over this :

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

Set the API key header when calling the API:

```bash
curl -H "x-api-key: change-me" http://localhost:3000/api/roblox/moderation/pending
```
