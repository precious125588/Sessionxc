import { useState, useRef, useEffect, useCallback } from "react";
import MusicPlayer from "./pages/MusicPlayer";
import SessionPairing from "./pages/SessionPairing";

export const songs = [
  { title: "Essence",              artist: "Wizkid ft. Tems",              genre: "Afrobeats",            ytId: "vDF-U3ZOAxY" },
  { title: "Ye",                   artist: "Burna Boy",                    genre: "Afrobeats",            ytId: "1Cr0kqFhP0U" },
  { title: "Calm Down",            artist: "Rema ft. Selena Gomez",        genre: "Afrobeats",            ytId: "Y3S2MflEMiM" },
  { title: "Love Nwantiti",        artist: "CKay",                         genre: "Afropop",              ytId: "PFRjKjEf0s0" },
  { title: "Rush",                 artist: "Ayra Starr",                   genre: "Afropop",              ytId: "LZ2FkIxnPIU" },
  { title: "Unavailable",          artist: "Davido ft. Musa Keys",         genre: "Afrobeats",            ytId: "OTZ8x4WIj1A" },
  { title: "Ojuelegba",            artist: "Wizkid",                       genre: "Afrobeats",            ytId: "G_ZhFPgNT0I" },
  { title: "Kwaku the Traveller",  artist: "Black Sherif",                 genre: "Afrobeats / Hip-Hop",  ytId: "OvlHb2OeWcU" },
  { title: "Won Da Mo",            artist: "Asake",                        genre: "Afrobeats",            ytId: "V8-GzqzOMAs" },
  { title: "Joha",                 artist: "Kizz Daniel",                  genre: "Afropop",              ytId: "MXp9G8c8n3I" },
  { title: "Peru",                 artist: "Fireboy DML ft. Ed Sheeran",   genre: "Afropop",              ytId: "n2VqNUFPujs" },
  { title: "Last Last",            artist: "Burna Boy",                    genre: "Afrobeats",            ytId: "aDlIYRDfKG4" },
  { title: "Sungba",               artist: "Asake ft. Burna Boy",          genre: "Afrobeats",            ytId: "AqONRYJFZj8" },
  { title: "Terminator",           artist: "Asake",                        genre: "Afrobeats",            ytId: "JtXRqmKC9Zk" },
  { title: "Blinding Lights",      artist: "The Weeknd",                   genre: "Pop / Synth-pop",      ytId: "4NRXx6U8ABQ" },
  { title: "Cruel Summer",         artist: "Taylor Swift",                 genre: "Pop",                  ytId: "ic8j13piAhQ" },
  { title: "Creepin'",             artist: "Metro Boomin ft. The Weeknd",  genre: "R&B / Hip-Hop",        ytId: "cNtXSGVqAYo" },
  { title: "Flowers",              artist: "Miley Cyrus",                  genre: "Pop",                  ytId: "G7KNmW9a75Y" },
  { title: "Vampire",              artist: "Olivia Rodrigo",               genre: "Pop / Alt-Rock",       ytId: "RlPNh_PBZb4" },
  { title: "Houdini",              artist: "Eminem",                       genre: "Hip-Hop",              ytId: "GFEGa-seZOU" },
  { title: "Rich Flex",            artist: "Drake ft. 21 Savage",          genre: "Hip-Hop",              ytId: "lbBNPBNlBBk" },
  { title: "Calling My Phone",     artist: "Lil Tjay ft. 6LACK",          genre: "R&B / Pop",            ytId: "SZu6divine4" },
  { title: "Golden",               artist: "JVKE",                         genre: "Pop",                  ytId: "yUberB91H5s" },
  { title: "Die For You",          artist: "The Weeknd",                   genre: "R&B",                  ytId: "SJCTgtDU-74" },
  { title: "As It Was",            artist: "Harry Styles",                 genre: "Pop",                  ytId: "H5v3kku4y6Q" },
];

export type Song = typeof songs[0];

export interface PlayerState {
  playing: boolean;
  current: Song | null;
  iframeKey: number;
  start: () => void;
  stop: () => void;
  next: () => void;
}

function randomSong(exclude?: Song | null): Song {
  const pool = exclude ? songs.filter(s => s.ytId !== exclude.ytId) : songs;
  return pool[Math.floor(Math.random() * pool.length)];
}

export default function App() {
  const [tab, setTab] = useState<"music" | "session">("music");
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState<Song | null>(null);
  const [iframeKey, setIframeKey] = useState(0);

  // Register OS media session controls
  useEffect(() => {
    if (!("mediaSession" in navigator)) return;
    if (current) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: current.title,
        artist: current.artist,
        album: "MIAS MDX",
        artwork: [{ src: "https://files.catbox.moe/05rqy6.png", sizes: "512x512", type: "image/png" }],
      });
      navigator.mediaSession.setActionHandler("nexttrack", next);
      navigator.mediaSession.setActionHandler("stop", stop);
    }
  }, [current]);

  const start = useCallback(() => {
    const song = randomSong();
    setCurrent(song);
    setPlaying(true);
    setIframeKey(k => k + 1);
  }, []);

  const stop = useCallback(() => {
    setPlaying(false);
    setCurrent(null);
    if ("mediaSession" in navigator) {
      navigator.mediaSession.metadata = null;
    }
  }, []);

  const next = useCallback(() => {
    setCurrent(prev => {
      const song = randomSong(prev);
      setIframeKey(k => k + 1);
      if ("mediaSession" in navigator) {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: song.title,
          artist: song.artist,
          album: "MIAS MDX",
          artwork: [{ src: "https://files.catbox.moe/05rqy6.png", sizes: "512x512", type: "image/png" }],
        });
      }
      return song;
    });
  }, []);

  const playerState: PlayerState = { playing, current, iframeKey, start, stop, next };

  return (
    <div style={{ minHeight: "100vh", background: "#0a0a0f", fontFamily: "'Segoe UI', Tahoma, sans-serif" }}>
      <div className="bg-animated" />

      {/* Hidden persistent YouTube iframe — audio keeps playing across all tab switches */}
      {playing && current && (
        <iframe
          key={iframeKey}
          src={`https://www.youtube.com/embed/${current.ytId}?autoplay=1&rel=0&modestbranding=1&enablejsapi=1`}
          allow="autoplay; encrypted-media"
          style={{
            position: "fixed",
            width: 1,
            height: 1,
            bottom: 0,
            left: 0,
            opacity: 0,
            pointerEvents: "none",
            border: "none",
            zIndex: -1,
          }}
          title="audio"
        />
      )}

      <div style={{ position: "relative", zIndex: 1 }}>
        {/* Tab bar */}
        <div style={{
          display: "flex",
          borderBottom: "1px solid rgba(155,89,182,0.25)",
          background: "rgba(10,10,15,0.9)",
          backdropFilter: "blur(12px)",
          position: "sticky", top: 0, zIndex: 100,
        }}>
          <button onClick={() => setTab("music")} style={{
            flex: 1, border: "none", cursor: "pointer",
            padding: "15px 0", fontSize: "0.9rem", fontWeight: 700,
            letterSpacing: "0.5px", transition: "all 0.2s", background: "none",
            color: tab === "music" ? "#e056fd" : "#555",
            borderBottom: tab === "music" ? "2px solid #e056fd" : "2px solid transparent",
          }}>
            🎵 Music Player
          </button>
          <button onClick={() => setTab("session")} style={{
            flex: 1, border: "none", cursor: "pointer",
            padding: "15px 0", fontSize: "0.9rem", fontWeight: 700,
            letterSpacing: "0.5px", transition: "all 0.2s", background: "none",
            color: tab === "session" ? "#e056fd" : "#555",
            borderBottom: tab === "session" ? "2px solid #e056fd" : "2px solid transparent",
          }}>
            📱 Session Pairing
          </button>
        </div>

        {tab === "music" ? <MusicPlayer player={playerState} /> : <SessionPairing />}
      </div>
    </div>
  );
}
