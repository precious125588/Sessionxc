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
import crypto from "crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;
const AUTH_DIR = join(__dirname, "prezzy_auth");

// ✅ SONG LIST
const SONGS = [
  { title: "Essence", artist: "Wizkid ft. Tems", url: "/songs/essence.mp3" },
  { title: "Calm Down", artist: "Rema", url: "/songs/calmdown.mp3" },
  { title: "Blinding Lights", artist: "The Weeknd", url: "/songs/blindinglights.mp3" },
];

function randomSong() {
  return SONGS[Math.floor(Math.random() * SONGS.length)];
}

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server, path: "/session-ws" });

// ✅ Serve your existing homepage without changing it
app.use(express.static(join(__dirname, "dist")));

// ✅ Serve local songs
app.use("/songs", express.static(join(__dirname, "songs")));

// ✅ Serve the frontend JS for optional music
app.get("/randomSong.js", (_req, res) => {
  res.type("application/javascript");
  res.send(`
    const SONGS = ${JSON.stringify(SONGS)};

    window.addEventListener("DOMContentLoaded", () => {
      const audioPlayer = document.createElement("audio");
      audioPlayer.id = "audioPlayer";
      audioPlayer.controls = true;
      audioPlayer.style.display = "none";
      document.body.appendChild(audioPlayer);

      const nowPlayingDiv = document.createElement("div");
      nowPlayingDiv.id = "nowPlaying";
      document.body.appendChild(nowPlayingDiv);

      const welcomeDiv = document.createElement("div");
      welcomeDiv.id = "welcome";
      welcomeDiv.innerHTML = \`
        <h1>🎵 Welcome!</h1>
        <p>Would you like to listen to a song while you are here?</p>
        <button id="yesBtn">Yes</button>
        <button id="noBtn">No</button>
      \`;
      document.body.prepend(welcomeDiv);

      const yesBtn = document.getElementById("yesBtn");
      const noBtn = document.getElementById("noBtn");

      function playRandomSong() {
        const song = SONGS[Math.floor(Math.random() * SONGS.length)];
        audioPlayer.src = song.url;
        audioPlayer.style.display = "block";
        nowPlayingDiv.innerText = "🎵 Now Playing: " + song.title + " – " + song.artist;
        audioPlayer.play().catch(err => console.log("Autoplay blocked", err));
      }

      yesBtn.addEventListener("click", () => {
        welcomeDiv.style.display = "none";
        playRandomSong();
      });

      noBtn.addEventListener("click", () => {
        welcomeDiv.innerHTML = "<p>Okay, enjoy your visit! 🎵</p>";
      });

      audioPlayer.addEventListener("ended", () => {
        playRandomSong();
      });
    });
  `);
});

// ✅ Backend health check
app.get("/api", (req, res) => res.send("Backend running 🚀"));

// ✅ WhatsApp pairing & sending random song
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
    const sessionDir = join(AUTH_DIR, \`session_\${Date.now()}\`);
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

    if (method === "code" && phone) {
      let cleaned = phone.replace(/\D/g, "");
      if (cleaned.startsWith("0")) cleaned = "234" + cleaned.slice(1);
      try {
        if (!state.creds.registered) {
          log("Requesting pairing code...", "info");
          await new Promise(r => setTimeout(r, 5000));
          const code = await sock.requestPairingCode(cleaned);
          const formatted = code?.match(/.{1,4}/g)?.join("-") || code;
          send({ type: "pairing_code", code: formatted });
          log(\`Code: \${formatted}\`, "success");
        }
      } catch (err) {
        send({ type: "error", text: err.message });
      }
    }

    sock.ev.on("connection.update", async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr && method === "qr") {
        const dataUrl = await toDataURL(qr);
        send({ type: "qr", qrUrl: dataUrl });
      }

      if (connection === "open") {
        log("Connected!", "success");
        await saveCreds();

        try {
          const sessionId = "prezzy_" + crypto.randomUUID();
          send({ type: "authenticated", sessionId });

          const myId = sock.user?.id;
          if (myId) {
            const jid = myId.split(":")[0] + "@s.whatsapp.net";
            const song = randomSong();

            try {
              await sock.sendMessage(jid, {
                audio: { url: song.url.startsWith("/") ? "http://localhost:" + ${PORT} + song.url : song.url },
                mimetype: "audio/mpeg",
                ptt: false,
              });

              await sock.sendMessage(jid, {
                text: \`╔══════════════╗
║ 🥀PREZZY MDX   
║ 🥀 SESSION READY ║
╚══════════════╝

🎵 Now Playing: \${song.title}
👤 \${song.artist}

🔑 SESSION ID:
\${sessionId.substring(0, 60)}...\`,
              });
            } catch (audioErr) {
              log(\`Error sending song: \${audioErr.message}\`, "error");
            }
          }

          sock.end();
        } catch (err) {
          send({ type: "error", text: err.message });
        }
      }

      if (connection === "close") {
        const reason = new Boom(lastDisconnect?.error)?.output?.statusCode;
        if (reason === DisconnectReason.loggedOut) log("Logged out", "error");
        else if (!closed) log("Connection closed", "info");
      }
    });
  }

  ws.on("message", async (raw) => {
    try {
      const msg = JSON.parse(raw.toString());
      if (msg.type === "start") await startBaileys(msg.method, msg.phone || "");
      if (msg.type === "new_qr") {
        if (sock) sock.end();
        await startBaileys("qr");
      }
    } catch (err) {
      send({ type: "error", text: err.message });
    }
  });

  ws.on("close", () => {
    closed = true;
    if (sock) sock.end();
  });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log("Server running on port " + PORT);
});
