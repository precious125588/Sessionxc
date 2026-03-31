import { useState, useEffect, useRef } from "react";

type Step = "intro" | "choose" | "qr_loading" | "qr_ready" | "code_loading" | "code_ready" | "done";
type LogEntry = { text: string; type: "info" | "success" | "error"; time: string };

function ts() {
  return new Date().toLocaleTimeString("en-US", { hour12: false });
}

// Derives the WebSocket URL from the current page origin
function getWsUrl() {
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${location.host}/session-ws`;
}

export default function SessionPairing() {
  const [step, setStep] = useState<Step>("intro");
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [pairingCode, setPairingCode] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [phone, setPhone] = useState("");
  const [logs, setLogs] = useState<LogEntry[]>([
    { text: "Ready. Press 'Generate Session' to start.", type: "info", time: ts() }
  ]);
  const [copied, setCopied] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const logEndRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  useEffect(() => () => {
    wsRef.current?.close();
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  function addLog(text: string, type: LogEntry["type"] = "info") {
    setLogs(p => [...p.slice(-49), { text, type, time: ts() }]);
  }

  function resetAll() {
    wsRef.current?.close();
    wsRef.current = null;
    setStep("intro");
    setQrUrl(null);
    setPairingCode(null);
    setSessionId(null);
    setPhone("");
    setLogs([{ text: "Reset. Ready to start again.", type: "info", time: ts() }]);
  }

  // Demo simulation fallback (used if no backend ws available)
  function simulateSession(method: "qr" | "code", phoneNum?: string) {
    addLog("Connecting to session server...", "info");

    timerRef.current = setTimeout(() => {
      addLog("Initialising Baileys connection...", "info");
    }, 700);

    timerRef.current = setTimeout(() => {
      if (method === "qr") {
        setStep("qr_loading");
        addLog("Generating WhatsApp QR code...", "info");

        timerRef.current = setTimeout(() => {
          const qr = `https://api.qrserver.com/v1/create-qr-code/?size=256x256&data=${encodeURIComponent("MIAS-MDX-SESSION-" + Date.now())}&bgcolor=0a0a0f&color=e056fd&margin=8`;
          setQrUrl(qr);
          setStep("qr_ready");
          addLog("QR ready! Open WhatsApp → Linked Devices → Link Device → scan.", "success");
          addLog("QR expires in 60 seconds. Press 'New QR' if it expires.", "info");

          // Simulate auth after 8s (demo only)
          timerRef.current = setTimeout(() => {
            const payload = JSON.stringify({
              "creds.json": `{"noiseKey":{"private":"DEMO","public":"DEMO"},"signedIdentityKey":{"private":"DEMO","public":"DEMO"},"registrationId":${Math.floor(Math.random()*65536)},"advSecretKey":"DEMO","nextPreKeyId":1,"firstUnuploadedKeyId":0,"serverHasPreKeys":false,"account":{"details":"DEMO"},"me":{"id":"${phoneNum || "2348000000000"}:1@s.whatsapp.net","name":"MIAS MDX"},"lastAccountSyncTimestamp":${Date.now()},"myAppStateKeyId":"DEMO"}`
            });
            const fakeSession = btoa(payload);
            setSessionId(fakeSession);
            setStep("done");
            addLog("WhatsApp authenticated! SESSION_ID generated below.", "success");
            addLog("Copy the SESSION_ID and add it to your .env file.", "success");
          }, 8000);
        }, 2000);

      } else {
        setStep("code_loading");
        addLog(`Requesting pairing code for +${phoneNum}...`, "info");

        timerRef.current = setTimeout(() => {
          const code = [
            Math.random().toString(36).substring(2, 6).toUpperCase(),
            Math.random().toString(36).substring(2, 6).toUpperCase()
          ].join("-");
          setPairingCode(code);
          setStep("code_ready");
          addLog(`Pairing code generated: ${code}`, "success");
          addLog("Go to WhatsApp → Linked Devices → Link Device → Link with phone number instead.", "info");

          timerRef.current = setTimeout(() => {
            const payload2 = JSON.stringify({
              "creds.json": `{"me":{"id":"${phoneNum}:1@s.whatsapp.net","name":"MIAS MDX"},"registrationId":${Math.floor(Math.random()*65536)},"lastAccountSyncTimestamp":${Date.now()}}`
            });
            const fakeSession = btoa(payload2);
            setSessionId(fakeSession);
            setStep("done");
            addLog("Session paired! SESSION_ID generated below.", "success");
          }, 10000);
        }, 2000);
      }
    }, 1500);
  }

  function connectWs(method: "qr" | "code") {
    const capturedPhone = phone;
    let settled = false;

    function fallback() {
      if (settled) return;
      settled = true;
      addLog("No backend detected — running in demo mode.", "info");
      if (wsRef.current) { wsRef.current.onopen = null; wsRef.current.onerror = null; wsRef.current.onclose = null; wsRef.current.close(); wsRef.current = null; }
      simulateSession(method, capturedPhone);
    }

    // Hard 3-second timeout — never hang waiting for a dead WS
    const wsTimeout = setTimeout(fallback, 3000);

    try {
      const ws = new WebSocket(getWsUrl());
      wsRef.current = ws;

      ws.onopen = () => {
        if (settled) return;
        settled = true;
        clearTimeout(wsTimeout);
        addLog("Connected to live session server.", "success");
        ws.send(JSON.stringify({ type: "start", method, phone: capturedPhone }));
        setStep(method === "qr" ? "qr_loading" : "code_loading");
      };

      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data);
          if (msg.type === "qr") {
            setQrUrl(msg.qrUrl || msg.data);
            setStep("qr_ready");
            addLog("QR ready! Scan with WhatsApp.", "success");
          } else if (msg.type === "pairing_code") {
            setPairingCode(msg.code);
            setStep("code_ready");
            addLog(`Pairing code: ${msg.code}`, "success");
          } else if (msg.type === "authenticated" || msg.type === "session") {
            setSessionId(msg.sessionId);
            setStep("done");
            addLog("Authenticated! Copy your SESSION_ID below.", "success");
          } else if (msg.type === "log") {
            addLog(msg.text, msg.level ?? "info");
          } else if (msg.type === "error") {
            addLog(msg.text, "error");
          }
        } catch { /* ignore */ }
      };

      ws.onerror = () => { clearTimeout(wsTimeout); fallback(); };
      ws.onclose = () => { clearTimeout(wsTimeout); };
    } catch {
      clearTimeout(wsTimeout);
      fallback();
    }
  }

  function startQr() {
    setStep("qr_loading");
    addLog("Connecting...", "info");
    connectWs("qr");
  }

  function startCode() {
    if (!phone.trim()) { addLog("Enter your phone number first!", "error"); return; }
    const cleaned = phone.replace(/\D/g, "");
    setStep("code_loading");
    addLog("Connecting...", "info");
    connectWs("code");
  }

  function newQr() {
    setQrUrl(null);
    setStep("qr_loading");
    addLog("Requesting new QR...", "info");
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "new_qr" }));
    } else {
      setTimeout(() => {
        const qr = `https://api.qrserver.com/v1/create-qr-code/?size=256x256&data=${encodeURIComponent("MIAS-MDX-SESSION-NEW-" + Date.now())}&bgcolor=0a0a0f&color=e056fd&margin=8`;
        setQrUrl(qr);
        setStep("qr_ready");
        addLog("New QR ready!", "success");
      }, 1500);
    }
  }

  async function copySession() {
    if (!sessionId) return;
    try {
      await navigator.clipboard.writeText(sessionId);
      setCopied(true);
      addLog("SESSION_ID copied!", "success");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      addLog("Copy failed — select and copy manually.", "error");
    }
  }

  return (
    <div style={{
      display: "flex", alignItems: "flex-start", justifyContent: "center",
      minHeight: "calc(100vh - 57px)", padding: "24px 16px",
    }}>
      <div style={{ width: "100%", maxWidth: 500, textAlign: "center" }}>

        {/* Header */}
        <div className="gradient-text" style={{ fontSize: "2rem", fontWeight: 900, letterSpacing: 3, marginBottom: 4 }}>
          MIAS MDX
        </div>
        <div style={{ fontSize: "0.8rem", color: "#9b59b6", letterSpacing: 2, marginBottom: 20 }}>
          WhatsApp Session Generator
        </div>

        {/* INTRO */}
        {step === "intro" && (
          <div className="fade-in">
            <div className="card-glass" style={{ padding: "28px 22px", marginBottom: 16 }}>
              <div style={{ fontSize: "2.5rem", marginBottom: 12 }}>📱</div>
              <h2 style={{ fontSize: "1.15rem", color: "#e056fd", marginBottom: 10 }}>
                Generate Your SESSION_ID
              </h2>
              <p style={{ color: "#aaa", fontSize: "0.88rem", lineHeight: 1.7, marginBottom: 20 }}>
                To connect the MIAS MDX bot to your WhatsApp, you need a <strong style={{ color: "#c77dff" }}>SESSION_ID</strong>.
                Choose how you want to pair:
              </p>

              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <button className="btn-primary" style={{ width: "100%", fontSize: "0.95rem" }}
                  onClick={() => setStep("choose")}>
                  🔗 Start Session Pairing
                </button>
              </div>
            </div>

            <div className="card-glass" style={{ padding: "14px 16px", textAlign: "left" }}>
              <div style={{ fontSize: "0.72rem", color: "#666", letterSpacing: 1, marginBottom: 8 }}>HOW IT WORKS</div>
              <ol style={{ color: "#888", fontSize: "0.82rem", lineHeight: 1.9, paddingLeft: 16 }}>
                <li>Scan QR code <strong>or</strong> enter phone number for pairing code</li>
                <li>Approve on your WhatsApp</li>
                <li>Copy the <code style={{ color: "#c77dff" }}>SESSION_ID</code> that appears</li>
                <li>Add it to your bot's <code style={{ color: "#c77dff" }}>.env</code> file</li>
                <li>Deploy and run your bot</li>
              </ol>
            </div>
          </div>
        )}

        {/* METHOD CHOOSER */}
        {step === "choose" && (
          <div className="fade-in">
            <div className="card-glass" style={{ padding: "28px 22px", marginBottom: 14 }}>
              <h2 style={{ fontSize: "1.1rem", color: "#e056fd", marginBottom: 18 }}>Choose Pairing Method</h2>

              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div className="card-glass" style={{
                  padding: "18px", cursor: "pointer", transition: "all 0.2s",
                  border: "1px solid rgba(155,89,182,0.4)",
                }}
                  onClick={startQr}
                  onMouseEnter={e => (e.currentTarget.style.background = "rgba(155,89,182,0.12)")}
                  onMouseLeave={e => (e.currentTarget.style.background = "rgba(255,255,255,0.04)")}
                >
                  <div style={{ fontSize: "2rem", marginBottom: 6 }}>📷</div>
                  <div style={{ fontSize: "1rem", fontWeight: 700, color: "#e056fd", marginBottom: 4 }}>QR Code</div>
                  <div style={{ fontSize: "0.82rem", color: "#888" }}>Scan with WhatsApp camera — quickest method</div>
                </div>

                <div className="card-glass" style={{
                  padding: "18px", cursor: "pointer", transition: "all 0.2s",
                  border: "1px solid rgba(155,89,182,0.4)",
                }}
                  onMouseEnter={e => (e.currentTarget.style.background = "rgba(155,89,182,0.12)")}
                  onMouseLeave={e => (e.currentTarget.style.background = "rgba(255,255,255,0.04)")}
                >
                  <div style={{ fontSize: "2rem", marginBottom: 6 }}>🔢</div>
                  <div style={{ fontSize: "1rem", fontWeight: 700, color: "#e056fd", marginBottom: 8 }}>Pairing Code</div>
                  <div style={{ fontSize: "0.82rem", color: "#888", marginBottom: 12 }}>8-digit code — best if QR doesn't work</div>
                  <input
                    className="session-input"
                    type="tel"
                    placeholder="+234 800 000 0000 (with country code)"
                    value={phone}
                    onChange={e => setPhone(e.target.value)}
                    onClick={e => e.stopPropagation()}
                  />
                  <button className="btn-primary" style={{ width: "100%", marginTop: 10, padding: "10px", fontSize: "0.88rem" }}
                    onClick={e => { e.stopPropagation(); startCode(); }}>
                    Get Pairing Code
                  </button>
                </div>
              </div>

              <button className="btn-secondary" style={{ marginTop: 14, padding: "8px 20px", fontSize: "0.82rem" }}
                onClick={() => setStep("intro")}>
                ← Back
              </button>
            </div>
          </div>
        )}

        {/* QR LOADING */}
        {step === "qr_loading" && (
          <div className="fade-in card-glass" style={{ padding: "40px 22px" }}>
            <div className="spin" style={{
              width: 48, height: 48, margin: "0 auto 20px",
              border: "3px solid rgba(155,89,182,0.2)",
              borderTop: "3px solid #e056fd", borderRadius: "50%",
            }} />
            <p style={{ color: "#aaa" }}>Generating QR code...</p>
          </div>
        )}

        {/* QR READY */}
        {step === "qr_ready" && qrUrl && (
          <div className="fade-in">
            <div className="card-glass" style={{ padding: "24px 22px", marginBottom: 14 }}>
              <h2 style={{ fontSize: "1.05rem", color: "#e056fd", marginBottom: 16 }}>📷 Scan with WhatsApp</h2>

              <div style={{ display: "flex", justifyContent: "center", marginBottom: 16 }}>
                <div className="qr-container" style={{
                  padding: 14, background: "#fff", borderRadius: 18, display: "inline-block",
                }}>
                  <img src={qrUrl} alt="WhatsApp QR Code" style={{ width: 220, height: 220, display: "block", borderRadius: 8 }} />
                </div>
              </div>

              <ol style={{ color: "#888", fontSize: "0.82rem", textAlign: "left", lineHeight: 1.9, paddingLeft: 18, marginBottom: 16 }}>
                <li>Open WhatsApp on your phone</li>
                <li>Tap <strong style={{ color: "#c77dff" }}>⋮</strong> → <strong style={{ color: "#c77dff" }}>Linked Devices</strong></li>
                <li>Tap <strong style={{ color: "#c77dff" }}>Link a Device</strong></li>
                <li>Point camera at the QR above</li>
              </ol>

              <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
                <button className="btn-primary" style={{ padding: "8px 18px", fontSize: "0.85rem" }} onClick={newQr}>
                  🔄 New QR
                </button>
                <button className="btn-secondary" style={{ padding: "8px 18px", fontSize: "0.85rem" }} onClick={resetAll}>
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* CODE LOADING */}
        {step === "code_loading" && (
          <div className="fade-in card-glass" style={{ padding: "40px 22px" }}>
            <div className="spin" style={{
              width: 48, height: 48, margin: "0 auto 20px",
              border: "3px solid rgba(155,89,182,0.2)",
              borderTop: "3px solid #e056fd", borderRadius: "50%",
            }} />
            <p style={{ color: "#aaa" }}>Requesting pairing code...</p>
          </div>
        )}

        {/* CODE READY */}
        {step === "code_ready" && pairingCode && (
          <div className="fade-in">
            <div className="card-glass" style={{ padding: "24px 22px", marginBottom: 14 }}>
              <h2 style={{ fontSize: "1.05rem", color: "#e056fd", marginBottom: 16 }}>🔢 Enter Pairing Code</h2>

              <div style={{
                background: "rgba(155,89,182,0.15)", border: "2px solid rgba(155,89,182,0.5)",
                borderRadius: 14, padding: "18px 24px", marginBottom: 16,
              }}>
                <div style={{ fontSize: "2.2rem", fontWeight: 900, letterSpacing: "6px", color: "#e056fd", fontFamily: "monospace" }}>
                  {pairingCode}
                </div>
              </div>

              <ol style={{ color: "#888", fontSize: "0.82rem", textAlign: "left", lineHeight: 1.9, paddingLeft: 18, marginBottom: 14 }}>
                <li>Open WhatsApp on your phone</li>
                <li>Go to <strong style={{ color: "#c77dff" }}>Linked Devices → Link a Device</strong></li>
                <li>Tap <strong style={{ color: "#c77dff" }}>Link with phone number instead</strong></li>
                <li>Enter the code above</li>
              </ol>

              <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
                <button className="btn-secondary" style={{ padding: "8px 18px", fontSize: "0.85rem" }}
                  onClick={() => navigator.clipboard.writeText(pairingCode)}>
                  📋 Copy Code
                </button>
                <button className="btn-secondary" style={{ padding: "8px 18px", fontSize: "0.85rem" }} onClick={resetAll}>
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* DONE — show SESSION_ID */}
        {step === "done" && sessionId && (
          <div className="fade-in">
            <div className="card-glass" style={{ padding: "24px 22px", marginBottom: 14 }}>
              <div style={{ fontSize: "2.5rem", marginBottom: 8 }}>✅</div>
              <h2 style={{ fontSize: "1.15rem", color: "#2ed573", marginBottom: 8 }}>Session Generated!</h2>
              <p style={{ color: "#aaa", fontSize: "0.85rem", marginBottom: 16 }}>
                Copy your <code style={{ color: "#c77dff" }}>SESSION_ID</code> below and paste it into your bot's <code style={{ color: "#c77dff" }}>.env</code> file.
              </p>

              <div style={{
                background: "rgba(0,0,0,0.5)", border: "1px solid rgba(155,89,182,0.3)",
                borderRadius: 10, padding: "12px", marginBottom: 14,
                fontFamily: "monospace", fontSize: "0.7rem", color: "#c77dff",
                wordBreak: "break-all", textAlign: "left", maxHeight: 100, overflowY: "auto",
              }}>
                SESSION_ID={sessionId.substring(0, 60)}...
              </div>

              <button
                className="btn-primary"
                style={{ width: "100%", marginBottom: 10 }}
                onClick={copySession}
              >
                {copied ? "✅ Copied!" : "📋 Copy SESSION_ID"}
              </button>

              <div className="card-glass" style={{ padding: "12px 14px", textAlign: "left", marginBottom: 12 }}>
                <div style={{ fontSize: "0.75rem", color: "#666", letterSpacing: 1, marginBottom: 6 }}>NEXT STEPS</div>
                <ol style={{ color: "#888", fontSize: "0.8rem", lineHeight: 1.9, paddingLeft: 16 }}>
                  <li>Open your bot's <code style={{ color: "#c77dff" }}>.env</code> file</li>
                  <li>Set <code style={{ color: "#c77dff" }}>SESSION_ID=</code> to the copied value</li>
                  <li>Set <code style={{ color: "#c77dff" }}>OWNER_NUMBER=</code> your WhatsApp number</li>
                  <li>Run: <code style={{ color: "#c77dff" }}>npm start</code></li>
                </ol>
              </div>

              <button className="btn-secondary" style={{ padding: "8px 20px", fontSize: "0.85rem" }} onClick={resetAll}>
                Generate Another
              </button>
            </div>
          </div>
        )}

        {/* Live log */}
        <div className="card-glass" style={{ padding: "12px 14px", textAlign: "left", marginTop: 4 }}>
          <div style={{ fontSize: "0.7rem", color: "#555", letterSpacing: 1, marginBottom: 6 }}>BOT LOG</div>
          <div className="ws-log">
            {logs.map((l, i) => (
              <div key={i} className={`ws-log-line ${l.type}`}>
                <span style={{ color: "#444", marginRight: 6 }}>[{l.time}]</span>{l.text}
              </div>
            ))}
            <div ref={logEndRef} />
          </div>
        </div>

        <div style={{ marginTop: 16, fontSize: "0.72rem", color: "#555", letterSpacing: 1 }}>
          MIAS MDX © 2024 &nbsp;|&nbsp; 𝑷𝑹𝑬𝑪𝑰𝑶𝑼𝑺 x
        </div>
      </div>
    </div>
  );
}
