# Roblox integration guide

## Endpoints

- GET /api/roblox/moderation/pending
- POST /api/roblox/moderation/:id/processed

## Required headers

All requests should include:

- x-api-key: your-secret-key

## Example Roblox ServerScript

Place this in ServerScriptService as a script.

```lua
local HttpService = game:GetService("HttpService")
local Players = game:GetService("Players")

local API_URL = "http://sitegenesis.ddns.net:3000/api/roblox/moderation/pending"
local API_KEY = "your-secret-key"

local function getPendingActions()
	local success, response = pcall(function()
		local request = HttpService:RequestAsync({
			Url = API_URL,
			Method = "GET",
			Headers = {
				["x-api-key"] = API_KEY,
			},
		})
		return request.Body
	end)

	if not success then
		warn("Failed to fetch moderation actions:", response)
		return {}
	end

	local ok, decoded = pcall(function()
		return HttpService:JSONDecode(response)
	end)

	if not ok then
		warn("Failed to decode moderation actions:", decoded)
		return {}
	end

	return decoded
end

local function markProcessed(id)
	local success, response = pcall(function()
		local request = HttpService:RequestAsync({
			Url = "http://sitegenesis.ddns.net:3000/api/roblox/moderation/" .. id .. "/processed",
			Method = "POST",
			Headers = {
				["x-api-key"] = API_KEY,
				["Content-Type"] = "application/json",
			},
			Body = HttpService:JSONEncode({}),
		})
		return request.Body
	end)

	if not success then
		warn("Failed to mark action as processed:", response)
	end
end

local function applyModerationAction(action)
	if action.action == "ban" then
		local player = Players:GetPlayerByUserId(tonumber(action.userId) or -1)
		if player then
			player:Kick("You were banned by the moderation system.")
		end
	elseif action.action == "setGroupRank" then
		local metadata = action.metadata or {}
		warn("Apply role update in backend/Open Cloud worker. Target role:", metadata.roleId)
	end
end

while true do
	local actions = getPendingActions()
	if type(actions) == "table" then
		for _, action in ipairs(actions) do
			applyModerationAction(action)
			markProcessed(action.id)
		end
	end
	task.wait(5)
end
```

## Important note

This example kicks the player if they are already in the server. For a full production setup, you should also store bans in a DataStore so they persist across server restarts. (added database for that)

Community role-management actions like `setGroupRank` should be handled by a secure backend worker using Roblox Open Cloud credentials.

## Recommended community moderation flow

1. Discord command queues an action via `/api/roblox/moderation`
2. API worker consumes pending community actions
3. Worker calls your configured Open Cloud endpoints
4. Action status becomes `processed` or `failed`
5. Failed actions can be listed with `GET /api/roblox/moderation/failed` and retried with `POST /api/roblox/moderation/:id/retry`
