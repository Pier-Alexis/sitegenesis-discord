local HttpService = game:GetService("HttpService")
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService = game:GetService("RunService")

local MODERATION_NOTIFICATION_EVENT_NAME = "ModerationNotificationEvent"
local moderationNotificationEvent = ReplicatedStorage:FindFirstChild(MODERATION_NOTIFICATION_EVENT_NAME)

if not moderationNotificationEvent then
	moderationNotificationEvent = Instance.new("RemoteEvent")
	moderationNotificationEvent.Name = MODERATION_NOTIFICATION_EVENT_NAME
	moderationNotificationEvent.Parent = ReplicatedStorage
end

local serverId = game.JobId ~= "" and game.JobId or "Studio-" .. tostring(game.PlaceId) -- Add 2 dashes to this if you are publishing on roblox
--local serverId = game.JobId -- Add 2 Dashes to this if you are testing on studio
local serverName = game.Name

<<<<<<< HEAD
<<<<<<< HEAD
local STUDIO_API_BASE_URL = "http://192.168.1.111:3000/api"
local LIVE_API_BASE_URL = "http://sitegenesis.ddns.net:3000/api"
local API_BASE_URL = RunService:IsStudio() and STUDIO_API_BASE_URL or LIVE_API_BASE_URL
=======
local API_BASE_URL = if RunService:IsStudio()
	then "http://192.168.1.111:3000/api"
	else "https://sitegenesis.ddns.net/api"
>>>>>>> 753a8b5a7ce2aab71be02e8c7c22ac75a70c7295
=======
local API_BASE_URL = if RunService:IsStudio()
	then "http://192.168.1.111:3000/api"
	else "https://sitegenesis.ddns.net/api"
=======
local STUDIO_API_BASE_URL = "http://192.168.1.111:3000/api"
local LIVE_API_BASE_URL = "http://sitegenesis.ddns.net:3000/api"
local API_BASE_URL = RunService:IsStudio() and STUDIO_API_BASE_URL or LIVE_API_BASE_URL
>>>>>>> 6d21b853be6ded33ad8e231cc61ba0325ee5056f
>>>>>>> eb8545d2c959f3bdb0f7c7abb9cf6461fc1d67e8

local API_URL = API_BASE_URL .. "/events"
local MODERATION_PENDING_URL = API_BASE_URL .. "/roblox/moderation/pending"
local MODERATION_PROCESSED_BASE_URL = API_BASE_URL .. "/roblox/moderation/"

local API_KEY = "Pk8QJjMLGkWh/fGwHRffkwkQvSvojVZh42rFpwQrsNt7YBo4ZXlKaGJHY2lPaUpTVXpJMU5pSXNJbXRwWkNJNkluTnBaeTB5TURJeExUQTNMVEV6VkRFNE9qVXhPalE1V2lJc0luUjVjQ0k2SWtwWFZDSjkuZXlKaGRXUWlPaUpTYjJKc2IzaEpiblJsY201aGJDSXNJbWx6Y3lJNklrTnNiM1ZrUVhWMGFHVnVkR2xqWVhScGIyNVRaWEoyYVdObElpd2lZbUZ6WlVGd2FVdGxlU0k2SWxCck9GRkthazFNUjJ0WGFDOW1SM2RJVW1abWEzZHJVWFpUZG05cVZscG9OREp5Um5CM1VYSnpUblEzV1VKdk5DSXNJbTkzYm1WeVNXUWlPaUl4TVRNd05qUXdNRGM1T1NJc0ltVjRjQ0k2TVRjNE5EUTRPRFUxTkN3aWFXRjBJam94TnpnME5EZzBPVFUwTENKdVltWWlPakUzT0RRME9EUTVOVFI5LkhwSFNBMWxQWGdyMWw0ZkRlMEVpWUxGelhXcFUxV1VkVFZhUnFvRWlGczhUR2NYdW9VWkhsb0lzNWxvQjJ5ZFBkRmhyTGY0dzdoZTZWUG9sZzBSaWVPUDNJUnI2cTFQbEdGNmNHNHFyaFNRNzZtYWNHV1R3Mk0zNEUtNkI2SnFmUnBIOFFHR0JYajdXUldIandTWHAyLWlJS29UQ1FkSS1sYVdhZm1LN1ZGU0RpaEJJNnUtN2xZUkFFRURtRlU0RjVvVllRTWlrY2FUZGp0aGZ2MW1ySWRTbWV2b2RRS3gzQVd4LTA1ekl1LVUwQ3BIYmxpeFcwRzdNamNmQ3lhemRpM0pVaUR1TUVXT0txRkhuYVNFY1lnR0VGSElmUFFBNmMtRkxuVDdWSUNtYVJOVWVGdThUVlAzWlRKRVJ6QURJV0czUGtwNzAzOUxadzc5SS1LcXZjQQ=="


local function sendEvent(data)

	local success, response = pcall(function()
		return HttpService:RequestAsync({
			Url = API_URL,
			Method = "POST",
			Headers = {
				["Content-Type"] = "application/json",
				["x-api-key"] = API_KEY
			},
			Body = HttpService:JSONEncode(data)
		})
	end)

	if success then
		print("Event sent:", response.StatusCode, response.Body)
	else
		warn("Failed sending event:", response)
	end
end

local function getRadioState(player)

	local playerGui =
		player:FindFirstChild("PlayerGui")

	if not playerGui then
		return false, "UnknownRadio"
	end

	local radioUi =
		playerGui:FindFirstChild("Radio")

	if not radioUi then
		return false, "UnknownRadio"
	end

	local activatedValue =
		radioUi:FindFirstChild("Activated")

	local channelValue =
		radioUi:FindFirstChild("Channel")

	local radioChannelName =
		"UnknownRadio"

	if channelValue and channelValue:IsA("StringValue") then
		radioChannelName =
			channelValue.Value .. "Radio"
	end

	if not activatedValue then
		return false, radioChannelName
	end

	if activatedValue:IsA("BoolValue") then
		return activatedValue.Value == true, radioChannelName
	end

	return false, radioChannelName
end

Players.PlayerAdded:Connect(function(player)

	sendEvent({
		type = "playerJoin",
		username = player.Name,
		userId = player.UserId,
		serverId = serverId,
		serverName = game.Name,
		placeId = game.PlaceId
	})

	player:GetPropertyChangedSignal("Team"):Connect(function()

		if not player.Team then
			return
		end

		print(
			player.Name ..
				" changed team to " ..
				player.Team.Name
		)

		sendEvent({
			type = "teamChanged",
			username = player.Name,
			userId = player.UserId,
			team = player.Team.Name,
			serverId = serverId,
			serverName = game.Name,
			placeId = game.PlaceId
		})
	end)

	player.Chatted:Connect(function(message)

		if player:GetAttribute("IsMutedFromModeration") == true then
			return
		end

		if player:GetAttribute("DisableChatLoggingSession") == true then
			return
		end

		if type(message) ~= "string" then
			return
		end

		local normalizedMessage =
			message:gsub("%s+", " "):gsub("^%s*(.-)%s*$", "%1")

		if normalizedMessage == "" then
			return
		end

		local isRadioActive, radioChannelName =
			getRadioState(player)

		if isRadioActive then
			sendEvent({
				type = "playerRadioChat",
				username = player.Name,
				userId = player.UserId,
				message = normalizedMessage,
				radioChannel = radioChannelName,
				serverId = serverId,
				serverName = game.Name,
				placeId = game.PlaceId
			})

			return
		end

		sendEvent({
			type = "playerChat",
			username = player.Name,
			userId = player.UserId,
			message = normalizedMessage,
			serverId = serverId,
			serverName = game.Name,
			placeId = game.PlaceId
		})

	end)

end)


Players.PlayerRemoving:Connect(function(player)

	print(
		"[SiteGenesis] PlayerRemoving:",
		player.Name
	)

	sendEvent({
		type = "playerLeave",
		username = player.Name,
		userId = player.UserId,
		serverId = serverId,
		serverName = serverName,
		placeId = game.PlaceId
	})

end)

local function sendServerCreated()

	local data = {
		type = "serverCreated",
		serverId = serverId,
		serverName = game.Name,
		placeId = game.PlaceId
	}

	print("Sending serverCreated event:")
	print(HttpService:JSONEncode(data))

	local success, response = pcall(function()

		return HttpService:RequestAsync({
			Url = API_URL,
			Method = "POST",
			Headers = {
				["Content-Type"] = "application/json",
				["x-api-key"] = API_KEY
			},
			Body = HttpService:JSONEncode(data)
		})

	end)

	if success then

		print("Server created HTTP request completed")
		print("Status code:", response.StatusCode)
		print("Response body:", response.Body)

		if response.Success then
			print("Server created event accepted by API")
		else
			warn(
				"API rejected serverCreated event:",
				response.StatusCode
			)
		end

	else

		warn(
			"Failed sending serverCreated event:",
			response
		)

	end
end


sendServerCreated()

local function getPendingModerationActions()

	local success, response = pcall(function()
		return HttpService:RequestAsync({
			Url = MODERATION_PENDING_URL,
			Method = "GET",
			Headers = {
				["Content-Type"] = "application/json",
				["x-api-key"] = API_KEY
			}
		})
	end)

	if not success then
		warn("Failed to fetch moderation actions (request threw):", tostring(response))
		return {}
	end

	if not response then
		warn("Failed to fetch moderation actions: missing response")
		return {}
	end

	if not response.Success then
		warn(
			("Failed to fetch moderation actions (HTTP %s): %s")
				:format(tostring(response.StatusCode), tostring(response.Body))
		)
		return {}
	end

	local decodedSuccess, decoded = pcall(function()
		return HttpService:JSONDecode(response.Body)
	end)

	if not decodedSuccess or type(decoded) ~= "table" then
		warn("Failed to decode moderation actions payload:", tostring(response.Body))
		return {}
	end

	return decoded
end

local function markModerationActionProcessed(actionId)

	local success, response = pcall(function()
		return HttpService:RequestAsync({
			Url = MODERATION_PROCESSED_BASE_URL .. tostring(actionId) .. "/processed",
			Method = "POST",
			Headers = {
				["Content-Type"] = "application/json",
				["x-api-key"] = API_KEY
			},
			Body = HttpService:JSONEncode({})
		})
	end)

	if not success then
		warn("Failed to mark moderation action as processed (request threw):", actionId, tostring(response))
		return
	end

	if not response then
		warn("Failed to mark moderation action as processed: missing response for", actionId)
		return
	end

	if not response.Success then
		warn(
			("Failed to mark moderation action as processed (%s, HTTP %s): %s")
				:format(tostring(actionId), tostring(response.StatusCode), tostring(response.Body))
		)
	end
end

local function findOnlinePlayerByUserId(userId)

	for _, player in ipairs(Players:GetPlayers()) do
		if tostring(player.UserId) == tostring(userId) then
			return player
		end
	end

	return nil
end

local function getKickReason(action)
	local reason = tostring(action.reason or "No reason provided")
	reason = reason:gsub("%s*%[kick%]%s*$", "")
	reason = reason:gsub("^%s+", ""):gsub("%s+$", "")

	if reason == "" then
		return "No reason provided"
	end

	return reason
end

local function sendModerationNotification(player, title, text, duration)
	if not player or not moderationNotificationEvent then
		return
	end

	local payload = {
		title = title,
		text = text,
		duration = duration or 8
	}

	pcall(function()
		moderationNotificationEvent:FireClient(player, payload)
	end)
end

local function applyModerationAction(action)

	if type(action) ~= "table" then
		return
	end

	local actionType = action.action
	local targetUserId = action.userId
	local metadata = action.metadata
	local player = findOnlinePlayerByUserId(targetUserId)
	local isLegacyKick = type(metadata) == "table" and metadata.moderationMode == "kick"

	if actionType == "ban" then
		if player then
			player:Kick("You were banned by the moderation system.")
		end
		return
	end

	if actionType == "kick" or (actionType == "warn" and isLegacyKick) then
		if player then
			player:Kick("You were kicked for: " .. getKickReason(action))
		end
		return
	end

	if actionType == "setGroupRank" then
		local metadata = action.metadata
		local roleId = metadata and (metadata.roleId or metadata.rank) or "unknown"
		warn("setGroupRank queued for user", targetUserId, "target role", roleId, ". Execute role update in backend worker.")
		return
	end

	if actionType == "mute" then
		if player then
			player:SetAttribute("IsMutedFromModeration", true)
			sendModerationNotification(
				player,
				"Moderation",
				"You have been muted and can no longer chat. Reason: " .. tostring(action.reason or "No reason provided"),
				10
			)
		end
		return
	end

	if actionType == "unmute" then
		if player then
			player:SetAttribute("IsMutedFromModeration", false)
			sendModerationNotification(
				player,
				"Moderation",
				"You have been unmuted and can chat again.",
				8
			)
		end
		return
	end

	if actionType == "unban" or actionType == "warn" then
		warn("Action received but no in-server handler defined for:", actionType)
		return
	end

	warn("Unsupported moderation action:", actionType)
end
-- // Attempt to save an event if it's not sent to the server
local eventQueue = {}

local function sendEvent(data)
	local success, response = pcall(function()
		return HttpService:RequestAsync({
			Url = API_URL,
			Method = "POST",
			Headers = {
				["Content-Type"] = "application/json",
				["x-api-key"] = API_KEY
			},
			Body = HttpService:JSONEncode(data)
		})
	end)

	if success and response.Success then
		print("Event sent:", response.StatusCode)
	else
		warn("Failed sending event, queuing for retry")
		table.insert(eventQueue, data)
	end
end

task.spawn(function()
	while true do
		task.wait(10)
		if #eventQueue > 0 then
			local pending = eventQueue
			eventQueue = {}
			for _, data in pending do
				sendEvent(data)
			end
		end
	end
end)

task.spawn(function()
	while true do
		local actions = getPendingModerationActions()

		for _, action in ipairs(actions) do
			local ok, err = pcall(function()
				applyModerationAction(action)
			end)

			if not ok then
				warn("Error while applying moderation action:", err)
			end

			if action.id then
				markModerationActionProcessed(action.id)
			end
		end

		task.wait(5)
	end
end)
