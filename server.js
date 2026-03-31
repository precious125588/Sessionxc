import express from "express";
import { createServer } from "http";
import { WebSocketServer } from "ws";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import {
  makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  makeCacheableSignalKeyStore,
} from "@whiskeysockets/baileys";
import { Boom } from "@hapi/boom";
import pino from "pino";
import { toDataURL } from "qrcode";
import fs from "fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;
const AUTH_DIR = join(__dirname, "prezzy_auth");

// Songs list — same as the Music Player
const SONGS = [
  { title: "Essence",              artist: "Wizkid ft. Tems",              genre: "Afrobeats" },
  { title: "Ye",                   artist: "Burna Boy",                    genre: "Afrobeats" },
  { title: "Calm Down",            artist: "Rema ft. Selena Gomez",        genre: "Afrobeats" },
  { title: "Love Nwantiti",        artist: "CKay",                         genre: "Afropop" },
  { title: "Rush",                 artist: "Ayra Starr",                   genre: "Afropop" },
  { title: "Unavailable",          artist: "Davido ft. Musa Keys",         genre: "Afrobeats" },
  { title: "Ojuelegba",            artist: "Wizkid",                       genre: "Afrobeats" },
  { title: "Kwaku the Traveller",  artist: "Black Sherif",                 genre: "Afrobeats / Hip-Hop" },
  { title: "Won Da Mo",            artist: "Asake",                        genre: "Afrobeats" },
  { title: "Joha",                 artist: "Kizz Daniel",                  genre: "Afropop" },
  { title: "Peru",                 artist: "Fireboy DML ft. Ed Sheeran",   genre: "Afropop" },
  { title: "Last Last",            artist: "Burna Boy",                    genre: "Afrobeats" },
  { title: "Sungba",               artist: "Asake ft. Burna Boy",          genre: "Afrobeats" },
  { title: "Terminator",           artist: "Asake",                        genre: "Afrobeats" },
  { title: "Blinding Lights",      artist: "The Weeknd",                   genre: "Pop / Synth-pop" },
  { title: "Cruel Summer",         artist: "Taylor Swift",                 genre: "Pop" },
  { title: "Creepin'",             artist: "Metro Boomin ft. The Weeknd",  genre: "R&B / Hip-Hop" },
  { title: "Flowers",              artist: "Miley Cyrus",                  genre: "Pop" },
  { title: "Vampire",              artist: "Olivia Rodrigo",               genre: "Pop / Alt-Rock" },
  { title: "Houdini",              artist: "Eminem",                       genre: "Hip-Hop" },
  { title: "Rich Flex",            artist: "Drake ft. 21 Savage",          genre: "Hip-Hop" },
  { title: "Calling My Phone",     artist: "Lil Tjay ft. 6LACK",          genre: "R&B / Pop" },
  { title: "Golden",               artist: "JVKE",                         genre: "Pop" },
  { title: "Die For You",          artist: "The Weeknd",                   genre: "R&B" },
  { title: "As It Was",            artist: "Harry Styles",                 genre: "Pop" },
];

function randomSong() {
  return SONGS[Math.floor(Math.random() * SONGS.length)];
}

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server, path: "/session-ws" });

// Serve the built React app
app.use(express.static(join(__dirname, "dist")));
app.get("*", (_req, res) => res.sendFile(join(__dirname, "dist", "index.html")));

wss.on("connection", (ws) => {
  let sock = null;
  let closed = false;

  function send(obj) {
    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(obj));
  }

  function log(text, level = "info") {
    send({ type: "log", text, level });
  }

  async function startBaileys(method, phone) {
    const sessionDir = join(AUTH_DIR, `session_${Date.now()}`);
    fs.mkdirSync(sessionDir, { recursive: true });

    const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
    const logger = pino({ level: "silent" });

    sock = makeWASocket({
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, logger),
      },
      logger,
      printQRInTerminal: false,
      browser: ["Prezzy Session", "Chrome", "1.0.0"],
    });

    sock.ev.on("creds.update", saveCreds);

    // Request pairing code if phone method
    if (method === "code" && phone) {
      const cleaned = phone.replace(/\D/g, "");
      try {
        if (!sock.authState.creds.registered) {
          await new Promise(r => setTimeout(r, 2000));
          const code = await sock.requestPairingCode(cleaned);
          const formatted = code?.match(/.{1,4}/g)?.join("-") || code;
          send({ type: "pairing_code", code: formatted });
          log(`Pairing code: ${formatted}`, "success");
          log("WhatsApp → Linked Devices → Link with phone number", "info");
        }
      } catch (err) {
        send({ type: "error", text: `Pairing code error: ${err.message}` });
      }
    }

    sock.ev.on("connection.update", async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr && method === "qr") {
        try {
          const dataUrl = await toDataURL(qr, { margin: 1, width: 256, color: { dark: "#000", light: "#fff" } });
          send({ type: "qr", qrUrl: dataUrl });
          log("QR ready — scan with WhatsApp!", "success");
        } catch { /* ignore */ }
      }

      if (connection === "open") {
        log("Connected! Building your SESSION_ID...", "success");
        await saveCreds();

        try {
          // Encode all auth files to base64 JSON — Baileys-compatible format
          const files = {};
          fs.readdirSync(sessionDir).forEach(f => {
            try { files[f] = fs.readFileSync(join(sessionDir, f), "utf8"); } catch { /* skip */ }
          });
          const sessionId = Buffer.from(JSON.stringify(files)).toString("base64");

          // Send SESSION_ID to browser
          send({ type: "authenticated", sessionId });
          log("SESSION_ID ready! Copy it from the box above.", "success");

          // Get the user's own WhatsApp number then DM them
          const myId = sock.user?.id;
          if (myId) {
            const jid = myId.includes(":") ? myId.split(":")[0] + "@s.whatsapp.net" : myId;
            const song = randomSong();
            const dmText =
              `╔══════════════════════╗\n` +
              `║  *🤖 MIAS MDX Bot*      ║\n` +
              `║  *Session Generated!*  ║\n` +
              `╚══════════════════════╝\n\n` +
              `✅ Your WhatsApp session has been paired successfully!\n\n` +
              `📋 *SESSION_ID* (copy this into your bot's .env):\n` +
              `\`\`\`${sessionId.substring(0, 60)}...\`\`\`\n\n` +
              `> Full SESSION_ID was sent to your pairing page — copy it there.\n\n` +
              `🎵 *Now Playing — ${song.title}*\n` +
              `   👤 ${song.artist}\n` +
              `   🎶 ${song.genre}\n\n` +
              `_Made with ❤️ by 𝑷𝑹𝑬𝑪𝑰𝑶𝑼𝑺 x_`;

            try {
              await sock.sendMessage(jid, { text: dmText });
              log("DM sent to your WhatsApp with session info & a song!", "success");
            } catch (err) {
              log(`DM send failed: ${err.message}`, "error");
            }
          }

          sock.end();
        } catch (err) {
          send({ type: "error", text: `Session error: ${err.message}` });
        }
      }

      if (connection === "close") {
        const reason = new Boom(lastDisconnect?.error)?.output?.statusCode;
        if (reason === DisconnectReason.loggedOut) {
          log("Logged out from WhatsApp", "error");
        } else if (!closed) {
          log("Connection closed", "info");
        }
      }
    });
  }

  ws.on("message", async (raw) => {
    try {
      const msg = JSON.parse(raw.toString());
      if (msg.type === "start") {
        log(`Starting ${msg.method === "qr" ? "QR" : "pairing code"} session...`, "info");
        await startBaileys(msg.method, msg.phone || "");
      } else if (msg.type === "new_qr") {
        if (sock) { try { sock.end(); } catch { /* ignore */ } }
        log("Restarting for new QR...", "info");
        await startBaileys("qr", null);
      }
    } catch (err) {
      send({ type: "error", text: `Server error: ${err.message}` });
    }
  });

  ws.on("close", () => {
    closed = true;
    if (sock) { try { sock.end(); } catch { /* ignore */ } }
  });

  ws.on("error", () => {
    closed = true;
    if (sock) { try { sock.end(); } catch { /* ignore */ } }
  });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Prezzy Session Server running on port ${PORT}`);
});
