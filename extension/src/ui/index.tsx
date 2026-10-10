import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  defaults,
  initialState,
  send,
  type Settings,
  type SessionState,
  type Message,
} from "../shared";
import { Tracker } from "../tracking";
import { SpeechAdapter, installLocalSpeech } from "../speech";

const controllerView = document.body.dataset.view === "controller";
function App() {
  const [state, setState] = useState<SessionState>(initialState);
  const [settings, setSettings] = useState<Settings>(defaults);
  const [notice, setNotice] = useState("");
  const [progress, setProgress] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [command, setCommand] = useState("");
  const [logs, setLogs] = useState<any>(null);
  const [dark, setDark] = useState(
    matchMedia("(prefers-color-scheme: dark)").matches,
  );
  const video = useRef<HTMLVideoElement>(null);
  const tracker = useRef<Tracker | null>(null);
  const speech = useRef<SpeechAdapter | null>(null);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const stateRef = useRef(state);
  stateRef.current = state;
  const generation = useRef(0);
  const desired = useRef<"running" | "paused" | "stopped">("stopped");
  const busyRef = useRef(false);
  const deferredSpeechResume = useRef(false);
  const alive = useRef(true);
  async function safe(task: () => Promise<unknown>) {
    try {
      await task();
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : "The action failed. Try again.",
      );
    }
  }
  async function calibrate() {
    if (!tracker.current) {
      setNotice("Start the camera before calibration.");
      return;
    }
    if (progress !== null) return;
    setProgress(0);
    try {
      await tracker.current.calibrate((value, instruction) => {
        if (alive.current) {
          setProgress(value);
          setNotice(instruction);
        }
      });
      setNotice("Calibration saved. Return to your webpage and try pointing.");
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : "Calibration failed. Try again in better light.",
      );
    } finally {
      setProgress(null);
    }
  }
  function shouldRun() {
    return desired.current === "running";
  }
  async function beginSpeech(token: number) {
    if (token !== generation.current || desired.current !== "running") return;
    speech.current?.stop();
    speech.current = new SpeechAdapter(
      (text) => {
        if (token === generation.current && desired.current === "running")
          void send({ type: "HEARD", text }).catch(() => {});
      },
      (voice) => {
        if (token === generation.current)
          void send({ type: "SET_STATE", patch: { voice } }).catch(() => {});
      },
    );
    try {
      await speech.current.start(settingsRef.current);
    } catch (error) {
      if (token === generation.current && desired.current === "running")
        setNotice(
          error instanceof Error
            ? error.message
            : "Voice unavailable. Check microphone permission.",
        );
    }
  }
  async function start() {
    if (busyRef.current) return;
    busyRef.current = true;
    desired.current = "running";
    setBusy(true);
    setNotice("");
    const current = ++generation.current;
    deferredSpeechResume.current = false;
    speech.current?.stop();
    speech.current = null;
    try {
      await send({ type: "SAVE_SETTINGS", settings: settingsRef.current });
      if (current !== generation.current || desired.current !== "running")
        return;
      await send({ type: "START" });
      if (current !== generation.current || desired.current !== "running")
        return;
      if (!video.current) throw new Error("Camera preview is unavailable.");
      tracker.current?.stop();
      tracker.current = new Tracker(
        video.current,
        (sample) => {
          if (current === generation.current)
            void send({ type: "POINTER", sample }).catch(() => {});
        },
        (patch) => {
          if (current === generation.current)
            void send({ type: "SET_STATE", patch }).catch(() => {});
        },
      );
      try {
        await tracker.current.start(settingsRef.current);
      } catch (error) {
        if (current !== generation.current) return;
        await send({
          type: "SET_STATE",
          patch: {
            camera: "Unavailable",
            feedback:
              "Camera unavailable. Voice-only controls remain available.",
          },
        });
        setNotice(
          error instanceof Error
            ? error.message
            : "Camera denied. You can still use voice.",
        );
      }
      if (current !== generation.current) {
        tracker.current?.stop();
        return;
      }
      if (!shouldRun()) {
        tracker.current?.pause();
        return;
      }
      await beginSpeech(current);
    } catch (error) {
      if (current === generation.current)
        setNotice(error instanceof Error ? error.message : "Start failed.");
    } finally {
      busyRef.current = false;
      if (alive.current) setBusy(false);
      if (
        deferredSpeechResume.current &&
        current === generation.current &&
        shouldRun()
      ) {
        deferredSpeechResume.current = false;
        void beginSpeech(current);
      }
    }
  }
  async function shutdown() {
    desired.current = "stopped";
    deferredSpeechResume.current = false;
    setNotice("");
    ++generation.current;
    tracker.current?.stop();
    speech.current?.stop();
    setProgress(null);
    await send({ type: "STOP" });
  }
  useEffect(() => {
    alive.current = true;
    void Promise.all([
      send<SessionState>({ type: "GET_STATE" }),
      send<Settings>({ type: "GET_SETTINGS" }),
      chrome.storage.local.get("theme"),
    ])
      .then(([session, preferences, theme]) => {
        setState(session);
        setSettings(preferences);
        if (theme.theme) setDark(theme.theme === "dark");
      })
      .catch(() => setNotice("Could not connect. Reload the extension."));
    function listener(message: Message) {
      if (message.type === "STATE") {
        setState(message.state);
        if (
          controllerView &&
          message.state.paused &&
          desired.current === "running"
        ) {
          if (busyRef.current && speech.current)
            deferredSpeechResume.current = true;
          desired.current = "paused";
          tracker.current?.pause();
          speech.current?.pause();
          setProgress(null);
        }
        if (
          controllerView &&
          !message.state.running &&
          desired.current !== "stopped"
        ) {
          desired.current = "stopped";
          ++generation.current;
          tracker.current?.stop();
          speech.current?.stop();
          setProgress(null);
        }
      }
      if (controllerView && message.type === "CONTROLLER_COMMAND") {
        if (message.command === "pause") {
          if (busyRef.current && speech.current)
            deferredSpeechResume.current = true;
          desired.current = "paused";
          tracker.current?.pause();
          speech.current?.pause();
          setProgress(null);
        }
        if (message.command === "resume") {
          desired.current = "running";
          if (!tracker.current && !busyRef.current) {
            void start();
          } else {
            tracker.current?.resume();
            if (!busyRef.current) void beginSpeech(generation.current);
          }
        }
        if (message.command === "stop") {
          desired.current = "stopped";
          setNotice("");
          ++generation.current;
          tracker.current?.stop();
          speech.current?.stop();
          setProgress(null);
        }
        if (message.command === "calibrate") void calibrate();
        if (message.command === "start") void start();
      }
    }
    chrome.runtime.onMessage.addListener(listener);
    return () => {
      alive.current = false;
      desired.current = "stopped";
      ++generation.current;
      chrome.runtime.onMessage.removeListener(listener);
      tracker.current?.stop();
      speech.current?.stop();
    };
  }, []);
  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
  }, [dark]);
  async function toggleTheme() {
    setDark(!dark);
    await chrome.storage.local.set({ theme: dark ? "light" : "dark" });
  }
  async function openControls() {
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });
    await send({ type: "OPEN_CONTROLLER", tabId: tab?.id });
    window.close();
  }
  async function save(next: Settings) {
    setSettings(next);
    settingsRef.current = next;
    tracker.current?.updateSettings(next);
    await send({ type: "SAVE_SETTINGS", settings: next });
  }
  async function enablePages() {
    const granted = await chrome.permissions.request({
      origins: ["http://*/*", "https://*/*"],
    });
    setNotice(
      granted
        ? "Webpage access enabled. Return to your webpage."
        : "Webpage access denied. You can enable access later.",
    );
    if (granted && state.running) await send({ type: "START" });
  }
  async function enableTabs() {
    const granted = await chrome.permissions.request({ permissions: ["tabs"] });
    setNotice(
      granted
        ? "Tab commands enabled."
        : "Tab access denied. Current-page controls still work.",
    );
  }
  async function saveKey(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (settings.llmKey) {
      const granted = await chrome.permissions.request({
        origins: ["https://api.openai.com/*"],
      });
      if (!granted) {
        setNotice("OpenAI access was denied. Find stays unavailable.");
        return;
      }
    }
    await save(settings);
    setNotice(
      settings.llmKey
        ? "Key saved on this device. Only find commands send target labels and your phrase to OpenAI."
        : "Key removed. Arbitrary find is off.",
    );
  }
  async function annotate(type: string) {
    await send({ type: "METRIC", event: { at: Date.now(), type } });
    const messages: Record<string, string> = {
      "task-start": "Task timer started.",
      "task-complete": "Task completion recorded.",
      "selection-error": "Selection error recorded.",
      "accidental-activation": "Accidental activation recorded.",
    };
    setNotice(messages[type] || "Event recorded.");
  }
  async function exportLogs() {
    const data = await send({ type: "GET_LOGS" });
    setLogs(data);
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "handsfree-run.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <main className={controllerView ? "control-window" : "popup"}>
      <header>
        <a
          className="brand"
          href="#"
          onClick={(event) => event.preventDefault()}
          aria-label="Handsfree"
        >
          <img src="brand/handsfree-icon.svg" alt="" />
          handsfree<span>.</span>
        </a>
        <button
          className="icon-button"
          aria-label="Toggle color theme"
          onClick={() => void safe(toggleTheme)}
        >
          {dark ? "☀" : "☾"}
        </button>
      </header>
      <div className="eyebrow">
        {controllerView ? "YOUR BROWSER, YOUR PACE" : "CHROME, HANDSFREE"}
      </div>
      <h1>
        {controllerView ? (
          <>
            Make yourself
            <br />
            <span>comfortable.</span>
          </>
        ) : (
          <>
            Point. Speak.
            <br />
            <span>Browse.</span>
          </>
        )}
      </h1>
      <p className="intro">
        {controllerView
          ? "Keep this window open while browsing. Camera tracking runs here, not in a popup that disappears."
          : "Face movements, broad hand gestures, and voice. Each action stays intentional."}
      </p>
      <div className="session-status">
        <span
          className={
            state.running && !state.paused ? "status-dot active" : "status-dot"
          }
        />
        {state.running
          ? state.paused
            ? "Paused"
            : "Session running"
          : "Ready to start"}
        {state.dictating && <strong> · Dictation on</strong>}
      </div>
      <div className="actions">
        {controllerView ? (
          <button
            className="primary"
            disabled={busy}
            onClick={() => void safe(start)}
          >
            {busy
              ? "Starting…"
              : state.running
                ? "Restart session"
                : "Start session"}
          </button>
        ) : (
          <button className="primary" onClick={() => void safe(openControls)}>
            Open controls ↗
          </button>
        )}
        {state.running && (
          <>
            <button
              onClick={() =>
                void safe(() =>
                  send({ type: state.paused ? "RESUME" : "PAUSE" }),
                )
              }
            >
              {state.paused ? "Resume" : "Pause all"}
            </button>
            <button
              onClick={() =>
                void safe(
                  controllerView ? shutdown : () => send({ type: "STOP" }),
                )
              }
            >
              Stop
            </button>
          </>
        )}
      </div>
      <p className="feedback" role="status">
        {state.feedback}
      </p>
      <p className="fine local-notice" role="status" aria-live="polite">
        {notice}
      </p>
      {!controllerView && (
        <>
          <dl className="compact-status">
            <div>
              <dt>Camera</dt>
              <dd>{state.camera}</dd>
            </div>
            <div>
              <dt>Voice</dt>
              <dd>{state.voice}</dd>
            </div>
          </dl>
          <p className="fine">
            Alt + Shift + P pauses or resumes. First-time permissions and
            calibration happen in controls.
          </p>
        </>
      )}
      {controllerView && (
        <>
          <section aria-labelledby="camera-heading">
            <div className="section-heading">
              <h2 id="camera-heading">Your pointer</h2>
              <span>
                {settings.pointerMode === "face" ? "Face leads" : "Broad hand"}
              </span>
            </div>
            <p>
              Camera frames stay on your device. Sit in your usual position with
              your face or hand clearly visible.
            </p>
            <video
              ref={video}
              autoPlay
              playsInline
              muted
              aria-label="Live camera preview"
            />
            <dl className="stats">
              <div>
                <dt>Camera</dt>
                <dd>{state.camera}</dd>
              </div>
              <div>
                <dt>Confidence proxy</dt>
                <dd>{Math.round(state.confidence * 100)}%</dd>
              </div>
              <div>
                <dt>Frame rate</dt>
                <dd>{state.fps.toFixed(1)} fps</dd>
              </div>
              <div>
                <dt>Inference</dt>
                <dd>{state.latencyMs.toFixed(0)} ms</dd>
              </div>
            </dl>
            <p className="fine">
              {state.trackingBackend}. Keep this window visible for consistent
              frame timing.
            </p>
            <label htmlFor="pointer-mode">Pointer source</label>
            <select
              id="pointer-mode"
              value={settings.pointerMode}
              onChange={(event) =>
                void safe(() =>
                  save({
                    ...settings,
                    pointerMode: event.target.value as Settings["pointerMode"],
                  }),
                )
              }
            >
              <option value="face">Face movements, primary pointer</option>
              <option value="hand">Broad hand, no pinch needed</option>
            </select>
            <button
              className="full"
              disabled={!state.running || state.paused || progress !== null}
              onClick={() => void safe(calibrate)}
            >
              {progress !== null ? "Calibrating…" : "Calibrate / recalibrate"}
            </button>
            {progress !== null && (
              <progress
                aria-label="Calibration progress"
                max="1"
                value={progress}
              />
            )}
            <p className="fine">
              About 8 seconds. Hold neutral, then move through a comfortable
              horizontal and vertical range. Selection is disabled during
              calibration.
            </p>
            <label htmlFor="sensitivity">
              Sensitivity <output>{settings.sensitivity.toFixed(1)}×</output>
            </label>
            <input
              id="sensitivity"
              type="range"
              min=".2"
              max="3"
              step=".1"
              value={settings.sensitivity}
              onChange={(event) =>
                void safe(() =>
                  save({
                    ...settings,
                    sensitivity: Number(event.target.value),
                  }),
                )
              }
            />
            <label htmlFor="dwell">
              Dwell time <output>{settings.dwellMs} ms</output>
            </label>
            <input
              id="dwell"
              type="range"
              min="400"
              max="2500"
              step="100"
              value={settings.dwellMs}
              onChange={(event) =>
                void safe(() =>
                  save({ ...settings, dwellMs: Number(event.target.value) }),
                )
              }
            />
            <label className="check">
              <input
                type="checkbox"
                checked={settings.dwellEnabled}
                onChange={(event) =>
                  void safe(() =>
                    save({ ...settings, dwellEnabled: event.target.checked }),
                  )
                }
              />
              Select after dwelling on a target
            </label>
            <label className="check">
              <input
                type="checkbox"
                checked={settings.edgeScroll}
                onChange={(event) =>
                  void safe(() =>
                    save({ ...settings, edgeScroll: event.target.checked }),
                  )
                }
              />
              Scroll after holding at a page edge
            </label>
          </section>
          <section aria-labelledby="voice-heading">
            <div className="section-heading">
              <h2 id="voice-heading">Voice & typing</h2>
              <span>{state.dictating ? "Typing" : "Commands"}</span>
            </div>
            <p>
              Local speech is the default. It needs Chrome support and an
              installed language pack. If unavailable, use pointing or typed
              commands below.
            </p>
            <label htmlFor="speech-mode">Speech processing</label>
            <select
              id="speech-mode"
              value={settings.speechMode}
              onChange={(event) =>
                void safe(() =>
                  save({
                    ...settings,
                    speechMode: event.target.value as Settings["speechMode"],
                  }),
                )
              }
            >
              <option value="local">On-device only</option>
              <option value="browser">
                Browser speech service, audio may leave device
              </option>
            </select>
            {settings.speechMode === "browser" && (
              <p className="warning">
                Browser speech can send microphone audio to Chrome's recognition
                provider. Choosing this mode opts into that behavior. Restart
                the session to apply.
              </p>
            )}
            <button
              className="full"
              onClick={() =>
                void safe(async () => {
                  await installLocalSpeech(settings.language);
                  setNotice(
                    "Language pack installed. Restart the session to enable voice.",
                  );
                })
              }
            >
              Install local English speech pack
            </button>
            <p className="fine">
              Changing speech mode takes effect on the next session start. Local
              mode never silently falls back to cloud speech.
            </p>
            <dl className="compact-status">
              <div>
                <dt>Microphone / recognizer</dt>
                <dd>{state.voice}</dd>
              </div>
              <div>
                <dt>Last heard</dt>
                <dd>{state.lastHeard || "Nothing yet"}</dd>
              </div>
            </dl>
            {state.dictating && (
              <button
                className="full"
                onClick={() =>
                  void safe(() =>
                    send({ type: "ACTION", intent: { type: "stop-typing" } }),
                  )
                }
              >
                Stop typing
              </button>
            )}
            <details>
              <summary>Commands you can say</summary>
              <p>
                Scroll up / down · go back / forward · click this · open this ·
                start typing · stop typing · submit form · confirm · cancel ·
                pause handsfree · stop handsfree.
              </p>
              <p>
                New tab · next / previous tab · close tab · go to [tab title] ·
                search for [words] · background search for [words] · open
                incognito · open history / downloads / settings.
              </p>
              <p>
                Find [page target] needs your own key. If matches tie, say
                choose one, choose two, and so on.
              </p>
              <p>
                During dictation, only the exact phrase "stop typing" ends
                typing. Other words insert as text. Use Pause all or the
                shortcut to pause immediately.
              </p>
            </details>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                const text = command.trim();
                setCommand("");
                if (text) void safe(() => send({ type: "HEARD", text }));
              }}
            >
              <label htmlFor="command">
                Type a command {state.dictating ? "or dictate text" : ""}
              </label>
              <div className="command-row">
                <input
                  id="command"
                  value={command}
                  onChange={(event) => setCommand(event.target.value)}
                  placeholder="scroll down"
                  autoComplete="off"
                />
                <button type="submit" disabled={!state.running || state.paused}>
                  Run
                </button>
              </div>
            </form>
          </section>
          <section aria-labelledby="access-heading">
            <h2 id="access-heading">Browser access</h2>
            <p>
              Grant webpage access for pointing across navigation. Tab access
              lets voice read titles and switch between open tabs. Chrome
              requires these permission buttons to be pressed.
            </p>
            <div className="stack">
              <button onClick={() => void safe(enablePages)}>
                Enable webpage access
              </button>
              <button onClick={() => void safe(enableTabs)}>
                Enable tab commands
              </button>
            </div>
            <p className="fine">
              Protected Chrome pages and the Chrome Web Store cannot be
              controlled. Incognito requires enabling "Allow in incognito" in
              extension details.
            </p>
          </section>
          <section aria-labelledby="find-heading">
            <h2 id="find-heading">Optional page find</h2>
            <p>
              Only "find…" uses an LLM. It sends your phrase and page target
              labels to OpenAI. It highlights a match and never clicks it. No
              key means this feature stays off.
            </p>
            <form onSubmit={(event) => void safe(() => saveKey(event))}>
              <label htmlFor="key">Your OpenAI API key, stored locally</label>
              <input
                id="key"
                type="password"
                autoComplete="off"
                value={settings.llmKey}
                onChange={(event) =>
                  setSettings({ ...settings, llmKey: event.target.value })
                }
              />
              <label htmlFor="model">Model</label>
              <input
                id="model"
                value={settings.llmModel}
                onChange={(event) =>
                  setSettings({ ...settings, llmModel: event.target.value })
                }
              />
              <button className="full" type="submit">
                Save find settings
              </button>
            </form>
          </section>
          <section aria-labelledby="logs-heading">
            <h2 id="logs-heading">Local run log</h2>
            <p>
              Inspect or export session events, timing, selections, and tracking
              samples. Logs stay on this device, retain the newest 500 events,
              and omit dictated text and keys. Mark task boundaries and errors
              during manual evaluation; the log cannot infer whether an action
              matched your intention.
            </p>
            <div className="stack">
              <button onClick={() => void safe(() => annotate("task-start"))}>
                Mark task start
              </button>
              <button
                onClick={() => void safe(() => annotate("task-complete"))}
              >
                Mark task complete
              </button>
            </div>
            <div className="actions annotation-actions">
              <button
                onClick={() => void safe(() => annotate("selection-error"))}
              >
                Mark selection error
              </button>
              <button
                onClick={() =>
                  void safe(() => annotate("accidental-activation"))
                }
              >
                Mark accidental activation
              </button>
            </div>
            <div className="actions">
              <button
                onClick={() =>
                  void safe(async () =>
                    setLogs(await send({ type: "GET_LOGS" })),
                  )
                }
              >
                Inspect
              </button>
              <button onClick={() => void safe(exportLogs)}>Export JSON</button>
              <button
                onClick={() =>
                  void safe(async () => {
                    await send({ type: "CLEAR_LOGS" });
                    setLogs(null);
                    setNotice("Local run log cleared.");
                  })
                }
              >
                Clear
              </button>
            </div>
            {logs && (
              <pre tabIndex={0} aria-label="Run log">
                {JSON.stringify(logs, null, 2)}
              </pre>
            )}
          </section>
        </>
      )}
      <footer>A Team Loondry project. Your web, on your terms.</footer>
    </main>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
