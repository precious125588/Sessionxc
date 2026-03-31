# Prezzy — WhatsApp Session Pairing by 𝑷𝑹𝑬𝑪𝑰𝑶𝑼𝑺 x

> **Real WhatsApp Session Generator** — Music Player + Live Baileys Session Pairing

## Features
- 🎵 **Music Player** — plays songs via embedded YouTube
- 📱 **Session Pairing** — generates a REAL WhatsApp SESSION_ID via QR code or pairing code (powered by Baileys)
- 🌙 Dark purple neon design
- 🚀 Ready to deploy on Render

## Deploy on Render
1. Push this folder to a GitHub repo
2. Go to https://render.com → New Web Service → connect repo
3. Build command: `npm install && npm run build`
4. Start command: `node server.js`
5. Add a Disk: mount path `/opt/render/project/src/prezzy_auth`, size 1GB
6. Deploy → open the URL → scan QR or enter phone number → copy SESSION_ID ✅

> **Vercel / Netlify will NOT work** — this app needs a persistent Node.js server for WebSocket + Baileys.

## Local Development
```bash
npm install
npm run build       # build the React frontend
node server.js      # start the server (serves frontend + WebSocket)
# Open http://localhost:3000
```

## How It Works
- `server.js` — Express server that serves the built React app and runs a WebSocket at `/session-ws`
- When you scan the QR or enter a pairing code, the backend uses Baileys to authenticate with WhatsApp
- Once authenticated, your SESSION_ID is generated and shown in the browser
- Auth files are saved to `prezzy_auth/` (mounted on persistent disk on Render)

## SESSION_ID Format
The session is a base64 of your Baileys auth folder:
```js
const files = {};
fs.readdirSync("prezzy_auth").forEach(f => {
  files[f] = fs.readFileSync(`prezzy_auth/${f}`, "utf8");
});
const SESSION_ID = Buffer.from(JSON.stringify(files)).toString("base64");
```

Made with love by 𝑷𝑹𝑬𝑪𝑰𝑶𝑼𝑺 x
