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
- GET /api/roblox/moderation/failed
- POST /api/roblox/moderation/:id/retry

### Community role management action

`POST /api/roblox/moderation` accepts one community-management action:

- `setGroupRank`

For `setGroupRank`, include `roleId` in metadata:

```json
{
	"action": "setGroupRank",
	"userId": "123456",
	"username": "RobloxPlayer",
	"reason": "Promotion",
	"moderator": "Mod#0001",
	"metadata": {
		"roleId": 200
	}
}
```

### Open Cloud worker setup

The API can process queued role-assignment actions directly if you enable the worker.

1. Set `COMMUNITY_MODERATION_ENABLED=true`
2. Set your `ROBLOX_GROUP_ID`
3. Set `ROBLOX_OPEN_CLOUD_API_KEY` (with group moderation permissions)
4. Configure `ROBLOX_SET_GROUP_RANK_ENDPOINT_TEMPLATE`

Each template must contain `{groupId}` and `{userId}` placeholders.

If an action fails, it is marked `failed` and can be retried with:

```bash
curl -X POST -H "x-api-key: change-me" http://localhost:3000/api/roblox/moderation/123/retry
```

### Full Roblox guide

See [ROBLOX_GUIDE.md](ROBLOX_GUIDE.md) for a ready-to-paste server script example.
