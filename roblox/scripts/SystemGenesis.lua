local HttpService = game:GetService("HttpService")
local Players = game:GetService("Players")

local serverId = game.JobId ~= "" and game.JobId or "Studio-" .. tostring(game.PlaceId)--only for roblox studio, use "serverId = game.JobId," before publishing to roblox
local serverName = game.Name

local API_URL = "http://192.168.1.111:3000/api/events"--change to http://sitegenesis.ddns.net:3000/api/events before publishing if not already done

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
