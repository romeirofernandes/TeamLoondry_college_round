import {captureCheck} from "../capture-check";
import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { initialState, send, type Message, type SessionState } from "../shared";

function Popup() {
  const [state, setState] = useState<SessionState>(initialState);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [preview, setPreview] = useState(false);
  const [previewError, setPreviewError] = useState("");
  const [retry, setRetry] = useState(0);
  const video = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    let alive = true;
    void send<SessionState>({ type: "GET_STATE" })
      .then((session) => {
        if (alive) setState(session);
      })
      .catch(() => {
        if (alive) setNotice("Reopen the popup to reconnect.");
      });
    const listener = (message: Message) => {
      if (message.type === "STATE") setState(message.state);
    };
    chrome.runtime.onMessage.addListener(listener);
    const theme = matchMedia("(prefers-color-scheme: dark)");
    const update = () =>
      document.documentElement.classList.toggle("dark", theme.matches);
    update();
    theme.addEventListener("change", update);
    return () => {
      alive = false;
      chrome.runtime.onMessage.removeListener(listener);
      theme.removeEventListener("change", update);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    let stream: MediaStream | null = null;
    setPreview(false);
    setPreviewError("");
    if (!state.running || state.voiceOnly) return;
    void navigator.mediaDevices
      .getUserMedia({
        video: { width: { ideal: 480 }, height: { ideal: 300 } },
        audio: false,
      })
      .then((capture) => {
        if (cancelled) {
          capture.getTracks().forEach((track) => track.stop());
          return;
        }
        stream = capture;
        if (video.current) video.current.srcObject = capture;
        setPreview(true);
      })
      .catch(() => {
        if (!cancelled)
          setPreviewError("Preview unavailable. You can keep using voice.");
      });
    return () => {
      cancelled = true;
      stream?.getTracks().forEach((track) => track.stop());
      if (video.current) video.current.srcObject = null;
    };
  }, [state.running, state.voiceOnly, retry]);

  async function run(work: () => Promise<unknown>) {
    if (busy) return;
    setBusy(true);
    setNotice("");
    try {
      const result = (await work()) as
        { ok?: boolean; error?: string } | undefined;
      if (result?.ok === false)
        throw new Error(result.error || "Open the dashboard to finish setup.");
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : "The action failed. Open the dashboard and retry.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function start() {
    const release=await captureCheck();
    try{
    // These prompts belong to this extension origin. A denied camera must not block microphone access.
    const denied: string[] = [];
    for (const kind of ["camera", "microphone"] as const) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia(
          kind === "camera" ? { video: true } : { audio: true },
        );
        stream.getTracks().forEach((track) => track.stop());
      } catch {
        denied.push(kind);
      }
    }
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });
    const result = await send({ type: "START", tabId: tab?.id });
    if (denied.length)
      setNotice(
        `${denied.join(" and ")} access denied. Available inputs can still work. Open the dashboard for setup.`,
      );
    return result;
    }finally{await release();}
  }

  return (
    <main className="popup">
      <div className="desktop-connection"><button onClick={()=>void send<{ok:boolean;error?:string}>({type:"DESKTOP_CONNECT"}).then(r=>setNotice(r?.ok?"Desktop connected. Browser Start will hide its panel.":r?.error||"Connection failed.")).catch(e=>setNotice(String(e)))}>Connect desktop</button><button onClick={()=>void send({type:"DESKTOP_DISCONNECT"}).then(()=>setNotice("Desktop disconnected. Browser can run independently."))}>Disconnect</button></div>
      <header>
        <a
          className="brand"
          href="#"
          onClick={(event) => {
            event.preventDefault();
            void run(() => send({ type: "OPEN_DASHBOARD" }));
          }}
          aria-label="Open Handsfree website"
        >
          <img src="brand/handsfree-icon.svg" alt="" />
          handsfree<span>.</span>
        </a>
        <span className="session-label">
          {state.running ? (state.paused ? "Paused" : "Running") : "Ready"}
        </span>
      </header>
      {state.running && !state.voiceOnly && (
        <div className="camera-preview">
          <video
            ref={video}
            autoPlay
            playsInline
            muted
            hidden={!preview}
            aria-label="Live camera preview"
          />
          {!preview && (
            <div className="preview-empty">
              <span aria-hidden="true">◎</span>
              <p>{previewError || "Connecting camera…"}</p>
              {previewError && (
                <button
                  className="small"
                  onClick={() => setRetry((value) => value + 1)}
                >
                  Retry preview
                </button>
              )}
            </div>
          )}
          {preview && <span className="camera-label">Live · mirrored</span>}
        </div>
      )}
      <div className="popup-heading">
        <h1>
          {state.running ? "Make yourself comfortable." : "Ready when you are."}
        </h1>
        <p>
          {state.running
            ? state.dictating
              ? "Dictation is on."
              : state.paused
                ? "Everything is paused."
                : state.voiceOnly ? "Voice only. The camera is off." : "Face, hands, and voice. Your pace."
            : "Start on a webpage. Set up in the dashboard."}
        </p>
      </div>
      <div className="actions">
        <button
          className="primary"
          disabled={busy}
          onClick={() =>
            void run(
              state.running
                ? () => send({ type: state.paused ? "RESUME" : "PAUSE" })
                : start,
            )
          }
        >
          {busy
            ? "Working…"
            : state.running
              ? state.paused
                ? "Resume"
                : "Pause"
              : "Start Handsfree"}
        </button>
        {state.running && (
          <button
            disabled={busy}
            onClick={() => void run(() => send({ type: "STOP" }))}
          >
            Stop
          </button>
        )}
      </div>
      <p className="feedback" role="status" aria-live="polite">
        {notice || state.feedback}
      </p>
      <button
        className="website-button"
        disabled={busy}
        onClick={() => void run(() => send({ type: "OPEN_DASHBOARD" }))}
      >
        Open dashboard<span aria-hidden="true">↗</span>
      </button>
      <footer>Alt + Shift + P to pause or resume</footer>
    </main>
  );
}
createRoot(document.getElementById("root")!).render(<Popup />);
