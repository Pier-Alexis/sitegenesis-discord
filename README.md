# Site-Genesis : Roblox to Discord bridge

## Overview

This project acts as a bridge between a Roblox game and a Discord server using a self-hosted backend.

Roblox cannot communicate directly with Discord's Bot API, so all communication passes through a backend server. This backend receives information from Roblox, processes it if needed, and forwards it to Discord. It can also receive commands from Discord and make them available to the Roblox game.


## Data Flow

### Roblox → Backend

The Roblox game can send information such as:

* Player joins
* Player leaves
* Chat messages
* Custom game events
* Reports
* Purchases
* Other server-side events

The backend receives these events through an HTTP API.

### Backend → Discord

After receiving an event, the backend can:

* Log it to a Discord channel
* Store it in a database
* Perform additional processing before sending it

### Discord → Backend

Moderators or administrators can interact with the backend through Discord commands.

Examples include:

* Ban a player
* Unban a player
* Send an announcement
* Create a warning
* View stored information

### Backend → Roblox

Roblox servers periodically request updates from the backend.

If a new command is available, the game executes the corresponding action.

## Components

### Roblox

Responsible for:

* Detecting in-game events
* Sending data to the backend
* Receiving moderation or administrative commands

### Backend

Responsible for:

* Receiving HTTP requests
* Validating data
* Storing information
* Communicating with Discord
* Making commands available to Roblox

### Discord Bot

Responsible for:

* Posting logs
* Receiving moderator commands
* Forwarding requests to the backend

## Notes

* Roblox communicates only with the backend.
* Discord communicates only with the backend.
* The backend is responsible for exchanging information between both platforms.
* A database can be added to keep logs, moderation history, or other persistent information.
