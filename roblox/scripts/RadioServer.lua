local TextChatService = game:GetService("TextChatService")
local Players = game:GetService("Players")
local Teams = game:GetService("Teams")
const HttpService = game:GetService("HttpService")
const RunService = game:GetService("RunService")

local serverId = game.JobId ~= "" and game.JobId or "Studio-" .. tostring(game.PlaceId)
local serverName = game.Name

local STUDIO_API_BASE_URL = "http://192.168.1.111:3000/api"
local LIVE_API_BASE_URL = "http://sitegenesis.ddns.net:3000/api"
local API_BASE_URL = RunService:IsStudio() and STUDIO_API_BASE_URL or LIVE_API_BASE_URL

local API_URL = API_BASE_URL .. "/events"
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
		print("Radio event sent:", response.StatusCode, response.Body)
	else
		warn("Failed sending radio event:", response)
	end
end

local function connectRadioLogging(radioChannel)
	radioChannel.MessageReceived:Connect(function(message)
		local textSource = message.TextSource

		if not textSource then
			return
		end

		local player = Players:GetPlayerByUserId(textSource.UserId)

		if not player then
			return
		end

		local text = message.Text

		if type(text) ~= "string" then
			return
		end

		local normalizedText = text:gsub("%s+", " "):gsub("^%s*(.-)%s*$", "%1")

		if normalizedText == "" then
			return
		end

		sendEvent({
			type = "playerRadioChat",
			username = player.Name,
			userId = player.UserId,
			message = normalizedText,
			radioChannel = radioChannel.Name,
			serverId = serverId,
			serverName = serverName,
			placeId = game.PlaceId
		})
	end)
end

-- 1. Create a folder to hold our radio channels nicely
local RadioFolder = Instance.new("Folder")
RadioFolder.Name = "RadioChannels"
RadioFolder.Parent = TextChatService

-- 2. Create the Global Radio
local GlobalRadio = Instance.new("TextChannel")
GlobalRadio.Name = "GlobalRadio"
GlobalRadio.Parent = RadioFolder
connectRadioLogging(GlobalRadio)

-- 3. Create Team-Specific Radios
for _, team in pairs(Teams:GetChildren()) do
	if team:IsA("Team") then
		local TeamRadio = Instance.new("TextChannel")
		TeamRadio.Name = team.Name .. "Radio"
		TeamRadio.Parent = RadioFolder
		connectRadioLogging(TeamRadio)
	end
end

-- 4. Function to update a player's radio access
local function UpdateRadioAccess(player)
	if not player.Team then return end

	-- A. Find their specific team radio and add them
	local teamRadio = RadioFolder:FindFirstChild(player.Team.Name .. "Radio")
	if teamRadio then
		teamRadio:AddUserAsync(player.UserId)
	end

	-- B. Check if they are allowed in the Global Radio
	if player.Team.Name ~= "Class-D" and player.Team.Name ~= "ChaosInsurgency" then
		GlobalRadio:AddUserAsync(player.UserId)
	end
end

-- 5. Listen for players joining and changing teams
Players.PlayerAdded:Connect(function(player)
	-- When they change teams, update their radio
	player:GetPropertyChangedSignal("Team"):Connect(function()
		UpdateRadioAccess(player)
	end)
end)