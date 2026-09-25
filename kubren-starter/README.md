# Kubren Builder

A small, persistent AI city builder for a local Minecraft Java server. Kubren connects through Mineflayer, asks an OpenAI-compatible model for a compact building plan, builds it with server commands, then stores progress in `state.json`.

## Requirements

- Node.js 18 or newer
- Minecraft Java server on `127.0.0.1:25565`
- Offline-mode test server or a compatible authenticated account
- Operator permission for the `Kubren` player because the starter uses `/fill`, `/say`, and `/gamemode`
- An OpenAI-compatible key is optional; without one Kubren uses built-in building presets

## Start

```powershell
cd kubren-starter
npm install
Copy-Item config.example.json config.json
npm start
```

Edit `config.json` before starting if your server address, ground height, or AI endpoint differs.

## How it works

1. Connect to the Minecraft server with Mineflayer.
2. Load `state.json`, or begin at plot zero.
3. Request a constrained JSON building plan from the configured model.
4. Sanitize every model value against size and material allowlists.
5. Build a hollow structure using bounded `/fill` commands.
6. Save the completed plan and move to the next city plot.

## Safety boundaries

The model never emits raw Minecraft commands. It can only choose a name, one allowed material, and bounded dimensions. All commands are constructed by deterministic code.

## Files

```text
kubren-starter/
|-- package.json
|-- config.example.json
|-- src/
|   `-- index.js
`-- state.json            created automatically
```