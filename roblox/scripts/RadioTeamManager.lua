local Players = game:GetService("Players")

-- Define which teams get which radio channel configuration
local TeamChannels = {
	["ChaosInsurgency"] = {Channel = "Chaos", Enabled = true},
	["Class-D"] = {Channel = "None", Enabled = false}, 
	["Undecided"] = {Channel = "None", Enabled = false},
}

local DefaultFoundationChannel = "Global"

local function UpdatePlayerRadio(player)

	local playerGui = player:WaitForChild("PlayerGui", 5)
	if not playerGui then 
		warn("DEBUG FAIL: PlayerGui didn't load in time for " .. player.Name)
		return 
	end

	local radioUI = playerGui:WaitForChild("Radio", 5) 
	if not radioUI then 
		warn("DEBUG FAIL: Could not find 'Radio' inside PlayerGui for " .. player.Name .. ". Check spelling!")
		return 
	end

	local channelValue = radioUI:WaitForChild("Channel", 5)
	local activatedValue = radioUI:WaitForChild("Activated", 5)

	if not channelValue or not activatedValue then 
		warn("DEBUG FAIL: Missing 'Channel' or 'Activated' Values inside the Radio UI!")
		return 
	end

	local currentTeam = player.Team
	if currentTeam then
		local config = TeamChannels[currentTeam.Name]

		if config then
			channelValue.Value = config.Channel
			radioUI.Enabled = config.Enabled
		else
			channelValue.Value = DefaultFoundationChannel
			radioUI.Enabled = true
		end

		-- Turn off the radio by default when they switch teams
		if activatedValue then
			activatedValue.Value = false
			local frame = radioUI:FindFirstChild("Frame")
			if frame then
				-- Reset the MicToggle button to Red/OFF
				local micToggle = frame:FindFirstChild("MicToggle")
				if micToggle then
					micToggle.BackgroundColor3 = Color3.fromRGB(151,36,26)
					micToggle.Text = "OFF"
				end

				-- Set the EnabledText to display the current Channel name!
				local enabledText = frame:FindFirstChild("EnabledText")
				if enabledText then
					enabledText.Text = string.upper(channelValue.Value) .. " RADIO"
					-- Optional: Make the background of the indicator Undecided, like black/gray
					enabledText.BackgroundColor3 = Color3.fromRGB(40, 40, 40) 
				end
			end
		end
	else
		warn("📻 DEBUG 5: " .. player.Name .. " has no team yet!")
	end

end

-- Listen for players joining and changing teams
Players.PlayerAdded:Connect(function(player)
	player:GetPropertyChangedSignal("Team"):Connect(function()
		UpdatePlayerRadio(player)
	end)

	player.CharacterAdded:Connect(function()
		task.wait(1) 
		UpdatePlayerRadio(player)
	end)
end)