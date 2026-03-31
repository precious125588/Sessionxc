import type { PlayerState } from "../App";

const barDelays = [0, 0.1, 0.2, 0.3, 0.4, 0.3, 0.2, 0.1, 0];

export default function MusicPlayer({ player }: { player: PlayerState }) {
  const { playing, current, start, stop, next } = player;

  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "center",
      minHeight: "calc(100vh - 57px)", padding: "20px",
    }}>
      <div style={{ width: "100%", maxWidth: 480, textAlign: "center" }}>

        {/* Animated visualizer */}
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "center", gap: 5, height: 60, marginBottom: 28 }}>
          {barDelays.map((delay, i) => (
            <div key={i}
              className={playing ? "visualizer-bar playing" : "visualizer-bar"}
              style={{ animationDelay: `${delay}s` }}
            />
          ))}
        </div>

        {/* Logo */}
        <div className="gradient-text" style={{ fontSize: "2.8rem", fontWeight: 900, letterSpacing: 4, marginBottom: 4 }}>
          MIAS MDX
        </div>
        <div style={{ fontSize: "0.85rem", color: "#9b59b6", letterSpacing: 2, marginBottom: 28 }}>
          by 𝑷𝑹𝑬𝑪𝑰𝑶𝑼𝑺 x
        </div>

        {/* Card */}
        <div className="card-glass" style={{ padding: "30px 24px", marginBottom: 24 }}>
          {!playing ? (
            <>
              <h2 style={{ fontSize: "1.3rem", color: "#e056fd", marginBottom: 10 }}>🎵 Welcome!</h2>
              <p style={{ color: "#aaa", fontSize: "0.92rem", lineHeight: 1.6, marginBottom: 24 }}>
                Hey there! Would you like to listen to some music while you're here?
              </p>
              <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
                <button className="btn-primary" onClick={start}>▶ Yes, Play Music</button>
                <button className="btn-secondary" onClick={() => {}}>Maybe Later</button>
              </div>
            </>
          ) : (
            <>
              <h2 style={{ fontSize: "1.1rem", color: "#e056fd", marginBottom: 6 }}>🎶 Now Playing</h2>
              <div style={{ fontSize: "1.25rem", fontWeight: 800, color: "#fff", marginBottom: 4 }}>
                {current?.title}
              </div>
              <div style={{ fontSize: "0.9rem", color: "#aaa", marginBottom: 10 }}>
                {current?.artist}
              </div>
              <span className="session-badge" style={{ marginBottom: 20, display: "inline-block" }}>
                {current?.genre}
              </span>

              {/* Progress shimmer bar */}
              <div style={{
                height: 3, borderRadius: 2,
                background: "rgba(155,89,182,0.2)",
                marginBottom: 20, overflow: "hidden",
              }}>
                <div style={{
                  height: "100%", width: "40%",
                  background: "linear-gradient(90deg, #9b59b6, #e056fd)",
                  borderRadius: 2,
                  animation: "shimmer 2s ease-in-out infinite alternate",
                }} />
              </div>

              <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
                <button className="btn-primary" style={{ padding: "11px 24px", fontSize: "0.92rem" }} onClick={next}>
                  ⏭ Next
                </button>
                <button className="btn-secondary ctrl-btn-stop" style={{ padding: "11px 24px", fontSize: "0.92rem" }} onClick={stop}>
                  ⏹ Stop
                </button>
              </div>
            </>
          )}
        </div>

        {/* Music keeps playing notice */}
        {playing && (
          <div className="fade-in" style={{
            color: "#666", fontSize: "0.78rem", letterSpacing: 0.5,
          }}>
            Music keeps playing while you browse — stop it anytime
          </div>
        )}

        <div style={{ marginTop: 28, fontSize: "0.72rem", color: "#444", letterSpacing: 1 }}>
          MIAS MDX © 2024 &nbsp;|&nbsp; 𝑷𝑹𝑬𝑪𝑰𝑶𝑼𝑺 x
        </div>
      </div>
    </div>
  );
        }

          
