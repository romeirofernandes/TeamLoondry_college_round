"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowSquareOut,
  ArrowsClockwise,
  ChartLine,
  CheckCircle,
  DownloadSimple,
  GearSix,
  Hand,
  Key,
  Microphone,
  Monitor,
  Pause,
  Play,
  Plugs,
  SlidersHorizontal,
  Square,
  Tabs as TabsIcon,
  UserFocus,
  UserCircle,
  SpeakerHigh,
  Question,
} from "@phosphor-icons/react";
import {
  defaults,
  inputMethods,
  voiceEnabled,
  normalizeControlSettings,
  initialState,
  type SessionState,
  type Settings,
  type MetricEvent,
  type PermissionState,
} from "../../../extension/src/shared";
import type { SiteSnapshot } from "../../../extension/src/sites/types";
import { cursorPaths } from "../../../extension/src/core/cursors";
import { request, subscribe, subscribeReady } from "@/lib/extension-bridge";
import BrandLogo from "@/components/brand-logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { CameraPreview } from "./camera-preview";
import { InputChoices, PrimaryPointer, inputLabels } from "./input-choices";
import { Onboarding } from "./onboarding";
import { useScreenGuidance } from "./use-screen-guidance";

type ProviderStatus = {
  groqKeyCount: number;
  jevConfigured: boolean;
  activeProvider: string | null;
  sharedKeys: boolean;
};
type BrowserTab = { id: number; title: string; url: string; active: boolean };
type RunLog = { events: MetricEvent[]; summary: Record<string, unknown> };
const views = [
  { id: "overview", label: "Session", icon: Monitor },
  { id: "preferences", label: "Inputs", icon: SlidersHorizontal },
  { id: "access", label: "Browser access", icon: Plugs },
  { id: "help", label: "Help", icon: Question },
  { id: "setup", label: "Setup", icon: UserFocus },
  { id: "pointer", label: "Pointer", icon: UserFocus },
  { id: "voice", label: "Voice", icon: Microphone },
  { id: "tabs", label: "Tabs", icon: TabsIcon },
  { id: "providers", label: "Advanced", icon: Key },
  { id: "activity", label: "Activity", icon: ChartLine },
];
const languages = [
  { value: "auto", label: "Automatic" },
  { value: "en-US", label: "English, US" },
  { value: "en-IN", label: "English, India" },
  { value: "hi-IN", label: "Hindi" },
  { value: "es-ES", label: "Spanish" },
  { value: "fr-FR", label: "French" },
  { value: "de-DE", label: "German" },
];

export function HandsfreeDashboard() {
  const [state, setState] = useState<SessionState>(initialState);
  const [settings, setSettings] = useState<Settings>(defaults);
  const settingsRef = useRef(settings);
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [recipientError, setRecipientError] = useState("");
  const [phraseError, setPhraseError] = useState("");
  const [view, setView] = useState("overview");
  const [command, setCommand] = useState("");
  const [providers, setProviders] = useState<ProviderStatus | null>(null);
  const [permissions, setPermissions] = useState<PermissionState | null>(null);
  const [pausePhrase, setPausePhrase] = useState(defaults.pausePhrase);
  const [messageRecipients, setMessageRecipients] = useState("");
  const [resumePhrase, setResumePhrase] = useState(defaults.resumePhrase);
  const [groqKeys, setGroqKeys] = useState([""]);
  const [jevKey, setJevKey] = useState("");
  const [tabs, setTabs] = useState<BrowserTab[]>([]);
  const [tabsLoaded, setTabsLoaded] = useState(false);
  const [siteSupport, setSiteSupport] = useState<SiteSnapshot | null>(null);
  const [supportLoaded, setSupportLoaded] = useState(false);
  const [logs, setLogs] = useState<RunLog | null>(null);
  const generation = useRef(0);
  const connectedRef = useRef(false);
  const refreshing = useRef(false);
  const settingsQueue = useRef(Promise.resolve());
  const guidance = useScreenGuidance(connected, handleDashboardVoice);
  useEffect(() => {
    if (!voiceEnabled(settings)) guidance.setListening(false);
  }, [settings.enabledInputs, settings.voiceOnly, guidance.setListening]);
  const calibrationPose =
    state.calibrationProgress === null
      ? ""
      : state.calibrationStage.split(" · ")[1] || "";
  useEffect(() => {
    if (calibrationPose && settings.spokenFeedback)
      void guidance.read(
        state.calibrationStage.split(" · ")[2]?.split(". Capturing")[0] ||
          calibrationPose,
      );
  }, [calibrationPose, settings.spokenFeedback, guidance.read]);

  const refresh = useCallback(async () => {
    const attempt = ++generation.current;
    refreshing.current = true;
    setConnecting(true);
    try {
      const [session, preferences, status, grants] = await Promise.all([
        request<SessionState>({ type: "GET_STATE" }),
        request<Settings>({ type: "GET_SETTINGS" }),
        request<ProviderStatus>({ type: "GET_PROVIDER_STATUS" }),
        request<PermissionState>({ type: "GET_PERMISSIONS" }),
      ]);
      if (attempt !== generation.current) return;
      setState(session);
      setSettings(preferences);
      settingsRef.current = preferences;
      setProviders(status);
      setPermissions(grants);
      setPausePhrase(preferences.pausePhrase);
      setResumePhrase(preferences.resumePhrase);
      setMessageRecipients(
        (preferences.testMessageRecipients || []).join(", "),
      );
      connectedRef.current = true;
      setConnected(true);
      setError("");
      await request({
        type: "SET_DASHBOARD_URL",
        url: `${location.origin}/dashboard`,
      });
    } catch {
      if (attempt === generation.current) {
        connectedRef.current = false;
        setConnected(false);
      }
    } finally {
      if (attempt === generation.current) {
        refreshing.current = false;
        setConnecting(false);
      }
    }
  }, []);

  useEffect(() => {
    const hashView = () => {
      const id = location.hash.slice(1);
      if (views.some((item) => item.id === id)) setView(id);
    };
    hashView();
    addEventListener("hashchange", hashView);
    const unsubscribe = subscribe((session) => {
      setState(session);
      if (!connectedRef.current && !refreshing.current) void refresh();
    });
    const unsubscribeReady = subscribeReady(() => {
      void refresh();
    });
    void refresh();
    let polling = false;
    const poll = setInterval(() => {
      if (polling || refreshing.current) return;
      if (!connectedRef.current) {
        void refresh();
        return;
      }
      polling = true;
      const attempt = generation.current;
      void request<SessionState>({ type: "GET_STATE" })
        .then((session) => {
          if (attempt !== generation.current) return;
          setState(session);
        })
        .catch(() => {
          if (attempt !== generation.current) return;
          connectedRef.current = false;
          setConnected(false);
        })
        .finally(() => {
          polling = false;
        });
    }, 5000);
    return () => {
      generation.current++;
      unsubscribe();
      unsubscribeReady();
      clearInterval(poll);
      removeEventListener("hashchange", hashView);
    };
  }, [refresh]);
  useEffect(() => setNotice(""), [state.feedback]);
  useEffect(() => {
    if (!connected) return;
    const read = () =>
      void request<PermissionState>({ type: "GET_PERMISSIONS" })
        .then(setPermissions)
        .catch(() => {});
    const timer = setInterval(read, 2000);
    addEventListener("focus", read);
    return () => {
      clearInterval(timer);
      removeEventListener("focus", read);
    };
  }, [connected]);

  async function safe(work: () => Promise<unknown>, success?: string) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await work();
      if (success) setNotice(success);
    } catch (cause) {
      setError(
        `${cause instanceof Error ? cause.message : "The action failed."} Check the extension and try again.`,
      );
    } finally {
      setBusy(false);
    }
  }
  function persist(patch: Partial<Settings>): Promise<void> {
    const current = settingsRef.current;
    const next = normalizeControlSettings({ ...current, ...patch });
    const completing = patch.onboardingCompleted === true;
    settingsRef.current = next;
    if (!completing) setSettings(next);
    const operation = settingsQueue.current
      .catch(() => {})
      .then(async () => {
        try {
          await request({ type: "SAVE_SETTINGS", settings: next });
          if (settingsRef.current === next) setSettings(next);
          setNotice("Preferences saved.");
          setError("");
        } catch {
          if (settingsRef.current === next) {
            settingsRef.current = current;
            setSettings(current);
          }
          const message =
            "Preferences could not be saved. Reconnect the extension, then retry.";
          setError(message);
          throw new Error(message);
        }
      });
    settingsQueue.current = operation.catch(() => {});
    return operation;
  }
  function save(patch: Partial<Settings>) {
    void persist(patch).catch(() => {});
  }
  function changeView(id: string) {
    setView(id);
    history.replaceState(null, "", `#${id}`);
    guidance.stopReading();
    setTimeout(
      () =>
        document
          .querySelector<HTMLElement>(
            '[role="tabpanel"][data-state="active"] h2',
          )
          ?.focus(),
      0,
    );
  }
  const showSetup = !settings.onboardingCompleted || view === "setup";
  const profileView = [
    "preferences",
    "pointer",
    "voice",
    "access",
    "providers",
    "activity",
  ].includes(view);
  const navigationViews = views.filter((item) =>
    profileView
      ? [
          "preferences",
          "pointer",
          "voice",
          "access",
          "providers",
          ...(view === "activity" ? ["activity"] : []),
        ].includes(item.id)
      : ["overview", "tabs", "help"].includes(item.id),
  );
  const locked = !connected || connecting || busy;
  function handleDashboardVoice(text: string) {
    if (showSetup || !guidance.listening) return;
    const phrase = text
      .toLowerCase()
      .trim()
      .replace(/[.!?,]+$/g, "");
    const destinations: Record<string, string> = {
      "open profile": "preferences",
      "open preferences": "preferences",
      "open pointer": "pointer",
      "open voice": "voice",
      "open browser access": "access",
      "open help": "help",
      "show tabs": "tabs",
      "back to session": "overview",
      "open advanced": "providers",
      "redo setup": "setup",
    };
    if (destinations[phrase]) {
      changeView(destinations[phrase]);
      return;
    }
    if (phrase === "stop reading" || phrase === "mute") {
      guidance.stopReading();
      return;
    }
    if (phrase === "stop listening") {
      guidance.setListening(false);
      return;
    }
    if (phrase === "repeat" || phrase === "read this screen") {
      void guidance.read(screenInstructions());
      return;
    }
    const controls: Record<
      string,
      "START" | "STOP" | "PAUSE" | "RESUME" | "RECALIBRATE"
    > = {
      "start session": "START",
      "pause session": "PAUSE",
      "resume session": "RESUME",
      "stop handsfree": "STOP",
      "stop session": "STOP",
      "calibrate pointer": "RECALIBRATE",
    };
    if (controls[phrase]) {
      void safe(async () => {
        await request({ type: controls[phrase] });
        if (controls[phrase] === "STOP") guidance.setListening(false);
        else if (guidance.listening)
          await request({ type: "UI_VOICE", enabled: true });
      });
      return;
    }
    const pointer = /^(?:use|switch to) (head|face|hands?)$/.exec(phrase);
    if (pointer)
      void safe(() =>
        request({
          type: "ACTION",
          intent: {
            type: "switch-pointer",
            mode: /^(head|face)$/.test(pointer[1]) ? "face" : "hand",
          },
        }),
      );
    if (view === "preferences") {
      if (phrase === "voice only") save({ enabledInputs: ["voice"] });
      const choice = /^(choose|add|remove) (voice|head|hands?)$/.exec(phrase);
      if (choice) {
        const method =
          choice[2] === "voice"
            ? "voice"
            : choice[2] === "head"
              ? "face"
              : "hand";
        const selected = inputMethods(settingsRef.current);
        const inputs =
          choice[1] === "remove"
            ? selected.filter((input) => input !== method)
            : ([
                ...new Set([...selected, method]),
              ] as Settings["enabledInputs"]);
        if (inputs?.length) save({ enabledInputs: inputs });
        else setError("Choose at least one control.");
      }
    }
  }
  function screenInstructions() {
    return profileView
      ? "Profile and preferences. Say open preferences, open pointer, open voice, open browser access, or back to session. In Inputs, say choose voice, choose head, choose hands, or voice only. Say use head or use hands to switch your primary pointer."
      : "Your session. Say start session, pause session, resume session, stop Handsfree, show tabs, open profile, or open help. Browsing commands work when you return to a webpage.";
  }
  function listenOnScreen() {
    if (guidance.listening) {
      guidance.setListening(false);
      return;
    }
    if (permissions?.microphone !== "granted") {
      void safe(() =>
        request({
          type: "GRANT_PERMISSIONS",
          kind: "devices",
          camera: false,
          microphone: true,
          returnHash: "#preferences",
        }),
      );
      return;
    }
    if (!voiceEnabled(settings)) {
      setError("Select Voice in Inputs before listening on this screen.");
      return;
    }
    guidance.setListening(true);
  }

  const running = connected && state.running && !state.paused;
  const status = !connected
    ? connecting
      ? "Connecting"
      : "Extension offline"
    : state.running
      ? state.paused
        ? "Paused"
        : "Running"
      : "Ready";
  async function permit(kind: "pages" | "tabs" | "provider") {
    await request({
      type: "GRANT_PERMISSIONS",
      kind,
      returnHash: "#preferences",
    });
    setNotice(
      "Finish permission setup in the extension window, then return here.",
    );
  }
  async function loadTabs() {
    const result = await request<BrowserTab[]>({ type: "GET_TABS" });
    setTabs(result);
    setTabsLoaded(true);
  }
  async function loadLogs() {
    setLogs(await request<RunLog>({ type: "GET_LOGS" }));
  }
  async function mark(type: string) {
    await request({ type: "METRIC", event: { type, at: Date.now() } });
    await loadLogs();
    setNotice("Event recorded.");
  }
  async function exportLogs() {
    const result = await request<RunLog>({ type: "GET_LOGS" });
    setLogs(result);
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(result, null, 2)], { type: "application/json" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "handsfree-run.json";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function runCommand(event: React.FormEvent) {
    event.preventDefault();
    const text = command.trim();
    if (!text) return;
    await safe(async () => {
      await request({ type: "HEARD", text });
      setCommand("");
    });
  }

  const sessionActions = (
    <div className="dashboard-actions">
      <Button
        disabled={locked}
        onClick={() =>
          void safe(() =>
            request({
              type: state.running
                ? state.paused
                  ? "RESUME"
                  : "PAUSE"
                : "START",
            }),
          )
        }
      >
        {state.running && !state.paused ? (
          <Pause data-icon="inline-start" aria-hidden="true" />
        ) : (
          <Play data-icon="inline-start" aria-hidden="true" />
        )}
        {busy
          ? "Working…"
          : state.running
            ? state.paused
              ? "Resume session"
              : "Pause session"
            : "Start session"}
      </Button>
      {state.running && (
        <Button
          variant="outline"
          disabled={locked}
          onClick={() => void safe(() => request({ type: "STOP" }))}
        >
          <Square data-icon="inline-start" aria-hidden="true" />
          Stop
        </Button>
      )}
    </div>
  );
  const commandForm = (
    <form onSubmit={runCommand} className="dashboard-command">
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor={`command-${view}`}>
            {state.dictating ? "Dictate text" : "Type a command"}
          </FieldLabel>
          <div className="dashboard-command-row">
            <Input
              id={`command-${view}`}
              value={command}
              onChange={(event) => setCommand(event.target.value)}
              placeholder={
                state.dictating ? "Words to insert in the page" : "scroll down"
              }
              autoComplete="off"
              disabled={locked || !state.running || state.paused}
            />
            <Button
              type="submit"
              variant="outline"
              disabled={locked || !state.running || state.paused}
            >
              Run
            </Button>
          </div>
          {state.dictating && (
            <FieldDescription>
              Your words go into the selected page field. Say "stop typing" to
              finish. Your pause, resume, and stop phrases remain available.
            </FieldDescription>
          )}
        </Field>
      </FieldGroup>
    </form>
  );

  const dashboardHeader = (
    <header className="dashboard-header">
      <BrandLogo href="/" />
      <div className="dashboard-header-actions">
        <a href="/" className="dashboard-home-link">
          Back to the website
          <ArrowSquareOut aria-hidden="true" />
        </a>
        {!showSetup && (
          <Button
            variant="outline"
            onClick={() => changeView("preferences")}
            aria-label="Profile and preferences"
          >
            <UserCircle data-icon="inline-start" aria-hidden="true" />
            Profile
          </Button>
        )}
        <ThemeToggle />
      </div>
    </header>
  );
  if (showSetup)
    return (
      <div className="handsfree-dashboard">
        <a className="skip-link" href="#dashboard-main">
          Skip to setup
        </a>
        {dashboardHeader}
        <main id="dashboard-main" className="dashboard-main">
          <Onboarding
            settings={settings}
            permissions={permissions}
            connected={connected}
            connecting={connecting}
            persist={persist}
            guidance={guidance}
            onReconnect={() => void refresh()}
            onComplete={() => changeView("overview")}
            calibration={<Calibration state={state} />}
            calibrationStatus={state.running ? state.feedback : ""}
            onCalibrate={async () => {
              if (state.paused)
                throw new Error(
                  "Resume the session before calibration, or finish setup and calibrate later.",
                );
              if (!state.running) await request({ type: "START" });
              await request({ type: "RECALIBRATE" });
            }}
          />
        </main>
      </div>
    );

  return (
    <div className="handsfree-dashboard">
      <a className="skip-link" href="#dashboard-main">
        Skip to dashboard
      </a>
      {dashboardHeader}
      <main id="dashboard-main" className="dashboard-main">
        <div className="dashboard-intro">
          <div>
            <p className="dashboard-overline">
              {profileView ? "Make it yours" : "Handsfree"}
            </p>
            <h1>{profileView ? "Profile and preferences" : "Your session"}</h1>
            <p className="dashboard-lead">
              {inputMethods(settings)
                .map((input) => inputLabels[input])
                .join(" + ")}
              .{" "}
              {settings.voiceOnly
                ? "Camera stays off."
                : `${inputLabels[settings.pointerMode]} controls your pointer.`}
            </p>
          </div>
          <div className="dashboard-session">
            <Badge variant="secondary">
              <span className="dashboard-status-dot" aria-hidden="true" />
              {status}
            </Badge>
            {!profileView && sessionActions}
            {profileView && (
              <Button variant="outline" onClick={() => changeView("overview")}>
                Back to session
              </Button>
            )}
            <p className="dashboard-shortcut">
              Alt + Shift + P to pause or resume
            </p>
          </div>
        </div>
        {!connected && (
          <Alert className="dashboard-connect" role="status">
            <Plugs aria-hidden="true" />
            <AlertTitle>
              {connecting
                ? "Connecting to Handsfree…"
                : "Connect your extension"}
            </AlertTitle>
            <AlertDescription>
              Load the Handsfree extension in Chrome, then reconnect. Settings
              and session controls become available when it connects.
            </AlertDescription>
            <div className="dashboard-connect-actions">
              <Button
                variant="outline"
                disabled={connecting}
                onClick={() => void refresh()}
              >
                <ArrowsClockwise data-icon="inline-start" aria-hidden="true" />
                Reconnect
              </Button>
              <a href="/#quick-guide">Read the setup guide</a>
            </div>
          </Alert>
        )}
        <div className="dashboard-message" role="status" aria-live="polite">
          {notice || (connected ? state.feedback : "")}
        </div>
        {error && (
          <Alert variant="destructive">
            <AlertTitle>Action unavailable</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <div className="dashboard-screen-tools">
          <Button
            variant="ghost"
            disabled={!connected}
            onClick={() => void guidance.read(screenInstructions())}
          >
            <SpeakerHigh data-icon="inline-start" aria-hidden="true" />
            Read this screen
          </Button>
          <Button variant="ghost" onClick={guidance.stopReading}>
            Stop reading
          </Button>
          {voiceEnabled(settings) && (
            <Button
              variant="outline"
              disabled={locked}
              onClick={listenOnScreen}
            >
              {guidance.listening
                ? "Stop listening on this screen"
                : "Listen on this screen"}
            </Button>
          )}
          <p role="status">
            {guidance.guidanceNotice ||
              (guidance.listening ? "Listening for dashboard commands." : "")}
          </p>
        </div>
        <Tabs
          value={view}
          onValueChange={changeView}
          className="dashboard-tabs"
        >
          <TabsList
            variant="line"
            aria-label={
              profileView ? "Preference sections" : "Dashboard sections"
            }
            className="dashboard-tab-list"
          >
            {navigationViews.map(({ id, label, icon: Icon }) => (
              <TabsTrigger key={id} value={id}>
                <Icon aria-hidden="true" />
                {label}
              </TabsTrigger>
            ))}
          </TabsList>
          <TabsContent value="preferences">
            <section className="dashboard-preferences-panel">
              <SectionTitle
                title="Choose what works for you"
                description="Combine controls and change them whenever you need. Your choices stay on this device."
              />
              <InputChoices
                selected={inputMethods(settings)}
                disabled={locked}
                onChange={(inputs) => {
                  if (!inputs.length) {
                    setError("Choose at least one control.");
                    return;
                  }
                  save({ enabledInputs: inputs });
                }}
              />
              <PrimaryPointer
                settings={settings}
                disabled={locked}
                onChange={(pointerMode) => save({ pointerMode })}
              />
              <SettingSwitch
                id="profile-spoken-feedback"
                label="Read guidance and results aloud"
                hint="Leave this off if you prefer your screen reader's voice."
                checked={settings.spokenFeedback}
                disabled={locked}
                onChange={(spokenFeedback) => save({ spokenFeedback })}
              />
              <div className="dashboard-preference-links">
                <Button variant="outline" onClick={() => changeView("pointer")}>
                  Adjust pointer
                </Button>
                <Button variant="outline" onClick={() => changeView("voice")}>
                  Adjust speech
                </Button>
                <Button variant="outline" onClick={() => changeView("access")}>
                  Review browser access
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => {
                    save({ onboardingStep: 0 });
                    changeView("setup");
                  }}
                >
                  Replay setup
                </Button>
              </div>
            </section>
          </TabsContent>
          <TabsContent value="overview">
            <div className="dashboard-two-column">
              <section className="dashboard-panel">
                <div className="dashboard-section-heading">
                  <div>
                    <h2 tabIndex={-1}>Your controls</h2>
                    <p>
                      Tracking runs in the extension. Preview your camera only
                      when you want to check your position.
                    </p>
                  </div>
                  <Badge variant="outline">
                    {settings.voiceOnly
                      ? "Voice only"
                      : settings.pointerMode === "face"
                        ? "Face pointer"
                        : "Hand pointer"}
                  </Badge>
                </div>
                <CameraPreview
                  running={running && !settings.voiceOnly}
                  voiceOnly={settings.voiceOnly}
                />
                <div className="dashboard-preview-footer">
                  <span>
                    {connected ? state.camera : "Camera not connected"}
                  </span>
                  <Button
                    variant="outline"
                    disabled={
                      locked ||
                      !running ||
                      settings.voiceOnly ||
                      state.paused ||
                      state.calibrationProgress !== null
                    }
                    onClick={() =>
                      void safe(() => request({ type: "RECALIBRATE" }))
                    }
                  >
                    <UserFocus data-icon="inline-start" aria-hidden="true" />
                    Calibrate
                  </Button>
                </div>
                <Calibration state={state} />
              </section>
              <section className="dashboard-panel">
                <div className="dashboard-section-heading">
                  <div>
                    <h2>Session at a glance</h2>
                    <p>Live readings from your extension.</p>
                  </div>
                </div>

                <div className="dashboard-transcript">
                  <p className="dashboard-small-label">
                    {state.dictating ? "Dictation on" : "Last heard"}
                  </p>
                  <p>
                    {connected
                      ? state.interimTranscript ||
                        state.lastHeard ||
                        "Say a command after starting a session."
                      : "Connect the extension to see voice activity."}
                  </p>
                </div>
                <details className="dashboard-disclosure">
                  <summary>Tracking details</summary>
                  <dl className="dashboard-metrics">
                    <Metric
                      label="Tracking confidence"
                      value={
                        connected && state.running
                          ? `${Math.round(state.confidence * 100)}%`
                          : "—"
                      }
                    />
                    <Metric
                      label="Frame rate"
                      value={
                        connected && state.running
                          ? `${state.fps.toFixed(1)} fps`
                          : "—"
                      }
                    />
                    <Metric
                      label="Inference latency"
                      value={
                        connected && state.running
                          ? `${Math.round(state.latencyMs)} ms`
                          : "—"
                      }
                    />
                    <Metric
                      label="Voice"
                      value={connected ? state.voice : "Not connected"}
                    />
                  </dl>{" "}
                </details>
                {commandForm}
                <div className="dashboard-inline-link">
                  <Button variant="ghost" onClick={() => changeView("pointer")}>
                    <SlidersHorizontal
                      data-icon="inline-start"
                      aria-hidden="true"
                    />
                    Tune your pointer
                  </Button>
                </div>
              </section>
            </div>
          </TabsContent>
          <TabsContent value="pointer">
            <div className="dashboard-two-column">
              <section className="dashboard-panel">
                <SectionTitle
                  title="Make pointing feel natural"
                  description="Tune your selected pointer. Add another control from Inputs whenever you need."
                />
                <FieldGroup>
                  <Field>
                    <FieldLabel id="pointer-mode-label">
                      Pointer source
                    </FieldLabel>
                    <ToggleGroup
                      type="single"
                      variant="outline"
                      value={settings.pointerMode}
                      disabled={locked}
                      onValueChange={(value) => {
                        if (value)
                          save({
                            pointerMode: value as Settings["pointerMode"],
                          });
                      }}
                      aria-labelledby="pointer-mode-label"
                    >
                      <ToggleGroupItem
                        value="face"
                        disabled={!inputMethods(settings).includes("face")}
                      >
                        <UserFocus aria-hidden="true" />
                        Head movement
                      </ToggleGroupItem>
                      <ToggleGroupItem
                        value="hand"
                        disabled={!inputMethods(settings).includes("hand")}
                      >
                        <Hand aria-hidden="true" />
                        Hand gestures
                      </ToggleGroupItem>
                    </ToggleGroup>
                  </Field>
                  <p className="dashboard-hint" role="note">
                    {settings.pointerMode === "face"
                      ? "Hold a small turn to keep moving. Return to neutral to stop in place."
                      : "Keep your complete open palm in view. Small palm movements cover the page; hold steady to select. Increase Hand sensitivity to travel farther. No pinch required."}
                  </p>
                  <Field>
                    <FieldLabel id="cursor-style-label">
                      Cursor style
                    </FieldLabel>
                    <div
                      className="dashboard-cursor-choices"
                      role="radiogroup"
                      aria-labelledby="cursor-style-label"
                    >
                      {(["circle", "arrow", "crosshair", "spark"] as const).map(
                        (style) => (
                          <label
                            key={style}
                            className="dashboard-cursor-choice"
                            data-selected={settings.cursorStyle === style}
                          >
                            <input
                              type="radio"
                              name="cursor-style"
                              value={style}
                              checked={settings.cursorStyle === style}
                              disabled={locked}
                              onChange={() => save({ cursorStyle: style })}
                            />
                            <CursorIcon style={style} />
                            <span>
                              {style[0].toUpperCase() + style.slice(1)}
                            </span>
                          </label>
                        ),
                      )}
                    </div>
                    <FieldDescription>
                      Every style keeps the visible dwell ring.
                    </FieldDescription>
                  </Field>
                  {settings.pointerMode === "face" && (
                    <SettingSlider
                      id="sensitivity"
                      label="Sensitivity"
                      value={settings.sensitivity}
                      display={`${settings.sensitivity.toFixed(1)}×`}
                      min={0.2}
                      max={6}
                      step={0.1}
                      disabled={locked}
                      onChange={(value) => save({ sensitivity: value })}
                    />
                  )}
                  {settings.pointerMode === "hand" && (
                    <SettingSlider
                      id="hand-sensitivity"
                      label="Hand sensitivity"
                      value={settings.handSensitivity}
                      display={`${settings.handSensitivity.toFixed(1)}×`}
                      min={0.2}
                      max={6}
                      step={0.1}
                      disabled={locked}
                      onChange={(value) => save({ handSensitivity: value })}
                    />
                  )}
                  <SettingSlider
                    id="dwell"
                    label="Dwell time"
                    value={settings.dwellMs}
                    display={`${settings.dwellMs} ms`}
                    min={400}
                    max={5000}
                    step={100}
                    disabled={locked}
                    onChange={(value) => save({ dwellMs: value })}
                  />
                  <SettingSlider
                    id="scroll-speed"
                    label="Scroll speed"
                    value={settings.scrollSensitivity}
                    display={`${settings.scrollSensitivity.toFixed(1)}×`}
                    min={0.2}
                    max={3}
                    step={0.1}
                    disabled={locked}
                    onChange={(value) => save({ scrollSensitivity: value })}
                  />
                  <SettingSlider
                    id="dead-zone"
                    label="Dead zone"
                    value={settings.deadZone}
                    display={`${Math.round(settings.deadZone * 100)}%`}
                    min={0}
                    max={0.15}
                    step={0.005}
                    disabled={locked}
                    onChange={(value) => save({ deadZone: value })}
                  />
                  <SettingSwitch
                    id="dwell-enabled"
                    label="Select with dwell"
                    hint="Hold on a target until its ring fills."
                    checked={settings.dwellEnabled}
                    disabled={locked}
                    onChange={(checked) => save({ dwellEnabled: checked })}
                  />
                  <SettingSwitch
                    id="edge-scroll"
                    label="Scroll at page edges"
                    hint="Hold at the top or bottom to scroll. Leaving the edge or losing tracking stops it."
                    checked={settings.edgeScroll}
                    disabled={locked}
                    onChange={(checked) => save({ edgeScroll: checked })}
                  />
                </FieldGroup>
              </section>
              <section className="dashboard-panel">
                <SectionTitle
                  title="A quick calibration"
                  description="Five guided captures in 15 seconds. Each mode saves its own comfortable movement range."
                />
                <CameraPreview
                  running={running && !settings.voiceOnly}
                  voiceOnly={settings.voiceOnly}
                />
                <Calibration state={state} />
                <Button
                  disabled={
                    locked ||
                    !running ||
                    settings.voiceOnly ||
                    state.paused ||
                    state.calibrationProgress !== null
                  }
                  onClick={() =>
                    void safe(() => request({ type: "RECALIBRATE" }))
                  }
                >
                  <UserFocus data-icon="inline-start" aria-hidden="true" />
                  {state.calibrationProgress !== null
                    ? "Calibrating…"
                    : "Calibrate pointer"}
                </Button>
                <ol className="dashboard-calibration-steps">
                  <li>
                    {settings.pointerMode === "face"
                      ? "Look ahead and hold your comfortable neutral position."
                      : "Show your open palm with every finger and your wrist inside the camera frame. Hold still."}
                  </li>
                  <li>
                    Follow the left, right, up and down prompts. Hold each pose
                    while its photo is captured. Choose your comfortable limit
                    in each direction.
                  </li>
                  <li>
                    {settings.pointerMode === "face"
                      ? "These measurements turn small head offsets into cursor speed. Return to center to stop in place."
                      : "Your small palm movement area maps onto the full webpage. Hand sensitivity makes that area smaller or larger."}
                  </li>
                </ol>
                <p className="dashboard-hint">
                  Selections pause during calibration. Low confidence and
                  tracking loss freeze movement and block clicks. Return to
                  view, hold still briefly, then review the highlighted target.
                  Recalibrate after a posture change if needed. Voice scrolling
                  works before camera calibration. Photos stay in this session
                  on your device and clear when you stop. Only landmark
                  measurements are saved for future sessions.
                </p>
              </section>
            </div>
          </TabsContent>
          <TabsContent value="voice" className="dashboard-voice-settings">
            <div className="dashboard-two-column">
              <section className="dashboard-panel">
                <SectionTitle
                  title="Speak comfortably"
                  description="Choose a language and where speech is processed."
                />
                <FieldGroup>
                  <SettingSwitch
                    id="spoken-feedback"
                    label="Speak feedback"
                    hint="Read choices and results aloud. Listening pauses during each response to prevent the assistant from hearing itself, then resumes."
                    checked={settings.spokenFeedback}
                    disabled={locked}
                    onChange={(checked) => save({ spokenFeedback: checked })}
                  />

                  <Field>
                    <FieldLabel htmlFor="language">
                      Recognition language
                    </FieldLabel>
                    <Select
                      value={settings.language}
                      disabled={locked}
                      onValueChange={(language) => save({ language })}
                    >
                      <SelectTrigger id="language" className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          {languages.map(({ value, label }) => (
                            <SelectItem key={value} value={value}>
                              {label}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="speech-mode">
                      Speech processing
                    </FieldLabel>
                    <Select
                      value={settings.speechMode}
                      disabled={locked}
                      onValueChange={(speechMode) =>
                        save({
                          speechMode: speechMode as Settings["speechMode"],
                        })
                      }
                    >
                      <SelectTrigger id="speech-mode" className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          <SelectItem value="browser">
                            Chrome speech with Groq fallback
                          </SelectItem>
                          <SelectItem value="local">
                            On-device speech
                          </SelectItem>
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                    <FieldDescription>
                      Changing language or processing restarts listening in an
                      active session.
                    </FieldDescription>
                  </Field>
                </FieldGroup>
                <Alert role="note">
                  <Microphone aria-hidden="true" />
                  <AlertTitle>
                    {settings.speechMode === "browser"
                      ? "Online speech processing"
                      : "On-device speech stays local"}
                  </AlertTitle>
                  <AlertDescription>
                    {settings.speechMode === "browser"
                      ? "Chrome speech may process audio online. If unavailable, microphone recordings go to Groq when a key is configured. Choose on-device speech to keep audio local."
                      : "Requires Chrome support and a language pack. It never switches to online speech automatically."}
                  </AlertDescription>
                </Alert>
                {settings.speechMode === "local" && (
                  <Button
                    variant="outline"
                    disabled={locked}
                    onClick={() =>
                      void safe(
                        () => request({ type: "INSTALL_SPEECH_PACK" }),
                        "Finish language-pack setup in the extension window.",
                      )
                    }
                  >
                    Install language pack
                  </Button>
                )}
                <div className="dashboard-transcript">
                  <p className="dashboard-small-label">
                    {state.dictating ? "Dictation on" : "Listening status"}
                  </p>
                  <p>
                    {connected ? state.voice : "Connect the extension first."}
                  </p>
                  <p>
                    {connected
                      ? state.interimTranscript ||
                        state.lastHeard ||
                        "No speech received yet."
                      : ""}
                  </p>
                </div>
                {state.dictating && (
                  <Button
                    variant="outline"
                    disabled={locked}
                    onClick={() =>
                      void safe(() =>
                        request({
                          type: "ACTION",
                          intent: { type: "stop-typing" },
                        }),
                      )
                    }
                  >
                    Stop typing
                  </Button>
                )}
                <details className="dashboard-disclosure">
                  <summary>Custom pause and resume phrases</summary>
                  <FieldGroup>
                    <Field>
                      <FieldLabel htmlFor="pause-phrase">
                        Pause keyword or phrase
                      </FieldLabel>
                      <Input
                        id="pause-phrase"
                        aria-invalid={!!phraseError}
                        aria-describedby="phrase-error"
                        value={pausePhrase}
                        maxLength={80}
                        disabled={locked}
                        onChange={(event) => setPausePhrase(event.target.value)}
                      />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="resume-phrase">
                        Resume keyword or phrase
                      </FieldLabel>
                      <Input
                        id="resume-phrase"
                        aria-invalid={!!phraseError}
                        aria-describedby="phrase-error"
                        value={resumePhrase}
                        maxLength={80}
                        disabled={locked}
                        onChange={(event) =>
                          setResumePhrase(event.target.value)
                        }
                      />
                      <FieldDescription>
                        These exact phrases work during dictation too. While
                        paused, the microphone listens only for session
                        controls. Stop releases it.
                      </FieldDescription>
                    </Field>
                    <Button
                      disabled={locked}
                      onClick={() => {
                        const pause = pausePhrase
                          .trim()
                          .toLowerCase()
                          .replace(/[.!?,;:]+$/g, "")
                          .replace(/\s+/g, " ");
                        const resume = resumePhrase
                          .trim()
                          .toLowerCase()
                          .replace(/[.!?,;:]+$/g, "")
                          .replace(/\s+/g, " ");
                        if (!pause || !resume || pause === resume) {
                          setPhraseError(
                            "Choose two different, nonempty session phrases.",
                          );
                          document.getElementById("pause-phrase")?.focus();
                          return;
                        }
                        setPhraseError("");
                        save({ pausePhrase: pause, resumePhrase: resume });
                      }}
                    >
                      Save session phrases
                    </Button>
                    <p
                      id="phrase-error"
                      className="dashboard-field-error"
                      role="status"
                    >
                      {phraseError}
                    </p>
                  </FieldGroup>
                </details>
                {commandForm}
              </section>
            </div>
          </TabsContent>
          <TabsContent value="help">
            <section className="dashboard-panel">
              <SectionTitle
                title="A few words do a lot"
                description="Fixed commands work without an AI key."
              />
              <details className="dashboard-disclosure">
                <summary>Commands for the current website</summary>
                <div>
                  <p>
                    Site commands cover Wikipedia, GitHub, Reddit, Amazon India,
                    Spotify, Netflix, X, WhatsApp, Gmail, Meet, LinkedIn, IRCTC
                    and Maps. Availability depends on the current page and
                    account. Live voice qualification is pending.
                  </p>
                  <Button
                    variant="outline"
                    disabled={locked}
                    onClick={() =>
                      void safe(async () => {
                        setSiteSupport(
                          await request<SiteSnapshot | null>({
                            type: "GET_SITE_CONTEXT",
                          }),
                        );
                        setSupportLoaded(true);
                      })
                    }
                  >
                    Check current page commands
                  </Button>
                  <div aria-live="polite">
                    {supportLoaded && !siteSupport && (
                      <p>
                        The selected tab has no dedicated site adapter. Generic
                        browser commands remain available.
                      </p>
                    )}
                    {siteSupport && (
                      <>
                        <p>
                          Selected page: {siteSupport.site}.{" "}
                          {siteSupport.current?.identity && (
                            <>Chat ID: {siteSupport.current.identity}. </>
                          )}
                          Say "what can I do here?" or "list results".
                        </p>
                        <ul>
                          {siteSupport.capabilities
                            .filter((item) => item.state !== "not-implemented")
                            .slice(0, 8)
                            .map((item) => (
                              <li key={item.id}>
                                {item.description} ·{" "}
                                {item.state.replaceAll("-", " ")}
                              </li>
                            ))}
                        </ul>
                      </>
                    )}
                  </div>
                </div>
              </details>
              <CommandList
                items={[
                  [
                    "Click",
                    "Click at the cursor, even without a snapped target",
                  ],
                  [
                    "Open Careers",
                    "Match a real page label locally and activate",
                  ],
                  ["Scroll down", "Read further on the page"],
                  ["Scroll to the bottom", "Reach the page or container end"],
                  [
                    "Play video / pause video",
                    "Control the main player, including permitted frames",
                  ],
                  [
                    "Forward ten seconds / rewind five seconds",
                    "Seek within video or music",
                  ],
                  ["Go back", "Return to the previous page"],
                  ["Start typing", "Dictate into the selected field"],
                  ["Stop typing", "Return to voice commands"],
                  ["Submit form", "Request submission, then say confirm"],
                  [
                    "Hey handsfree, find careers",
                    "Find a page target with Groq",
                  ],
                  [
                    "Hey handsfree, click Careers",
                    "Match locally and activate, with confirmation for submit",
                  ],
                  [
                    "Hey handsfree, summarize this page",
                    "Read a text answer here and on the webpage",
                  ],
                  [
                    "Hey handsfree, what is a browser?",
                    "Ask a general question",
                  ],
                  ["Choose two", "Select one of several find matches"],
                  [
                    settings.pausePhrase,
                    "Pause pointing, page actions and dictation",
                  ],
                  [settings.resumePhrase, "Resume your paused session"],
                ]}
              />
              <p className="dashboard-hint">
                During dictation, ordinary commands become text. Say "stop
                typing" to finish. Your configured pause and resume phrases, and
                "stop handsfree", remain session controls.
              </p>
            </section>
          </TabsContent>
          <TabsContent value="tabs">
            <div className="dashboard-two-column">
              <section className="dashboard-panel">
                <SectionTitle
                  title="Reach any open tab"
                  description="Tab titles are read only after you grant access."
                />
                <div className="dashboard-actions">
                  <Button
                    variant="outline"
                    disabled={locked}
                    onClick={() => void safe(() => permit("tabs"))}
                  >
                    Enable tab access
                  </Button>
                  <Button disabled={locked} onClick={() => void safe(loadTabs)}>
                    <ArrowsClockwise
                      data-icon="inline-start"
                      aria-hidden="true"
                    />
                    Refresh tabs
                  </Button>
                </div>
                {tabsLoaded && tabs.length > 0 ? (
                  <ul className="dashboard-browser-tabs">
                    {tabs.map((tab) => (
                      <li key={tab.id}>
                        <div>
                          <p>{tab.title || "Untitled tab"}</p>
                          <small>{displayOrigin(tab.url)}</small>
                          {tab.active && (
                            <Badge variant="secondary">Active</Badge>
                          )}
                        </div>
                        <Button
                          variant="outline"
                          disabled={locked}
                          onClick={() =>
                            void safe(() =>
                              request({ type: "ACTIVATE_TAB", id: tab.id }),
                            )
                          }
                        >
                          Switch
                        </Button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <Empty>
                    <EmptyHeader>
                      <EmptyMedia variant="icon">
                        <TabsIcon aria-hidden="true" />
                      </EmptyMedia>
                      <EmptyTitle>
                        {tabsLoaded
                          ? "No tabs available"
                          : "Your tabs appear here"}
                      </EmptyTitle>
                      <EmptyDescription>
                        Enable tab access, then refresh to see open tabs.
                      </EmptyDescription>
                    </EmptyHeader>
                  </Empty>
                )}
                {commandForm}
              </section>
              <section className="dashboard-panel">
                <SectionTitle
                  title="Move between pages"
                  description="Say a command or type it in the command field."
                />
                <CommandList
                  items={[
                    ["New tab", "Open a fresh tab"],
                    ["Next tab", "Move to the next tab"],
                    ["Previous tab", "Move to the previous tab"],
                    ["Go to Wikipedia", "Switch to a matching title"],
                    ["Close tab", "Ask to close, then say confirm"],
                    ["Search for jazz", "Search in a new tab"],
                    [
                      "Background search for jazz",
                      "Search without switching tabs",
                    ],
                    ["Open downloads", "Open Chrome downloads"],
                  ]}
                />
                <p className="dashboard-hint">
                  Closing a tab always needs confirmation. Chrome settings pages
                  and the Web Store cannot use the pointer overlay.
                </p>
              </section>
            </div>
          </TabsContent>
          <TabsContent value="providers">
            <details className="dashboard-disclosure">
              <summary>Message sending for testing</summary>
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="test-message-recipients">
                    Owned test recipients
                  </FieldLabel>
                  <FieldDescription id="test-recipients-help">
                    Sending requires an exact recipient here and a separate
                    voice confirmation. Use gmail:you@example.com,
                    whatsapp:exact chat ID, or meet:abc-defg-hij. Only add
                    recipients and private meetings you own or have permission
                    to test.
                  </FieldDescription>
                  <Input
                    id="test-message-recipients"
                    aria-describedby={
                      recipientError
                        ? "test-recipients-error test-recipients-help"
                        : "test-recipients-help"
                    }
                    aria-invalid={!!recipientError}
                    value={messageRecipients}
                    disabled={locked}
                    onChange={(event) =>
                      setMessageRecipients(event.target.value)
                    }
                  />
                  <p
                    id="test-recipients-error"
                    className="dashboard-field-error"
                    role="status"
                  >
                    {recipientError}
                  </p>
                </Field>
                <Button
                  variant="outline"
                  disabled={locked}
                  onClick={() => {
                    const entries = messageRecipients
                      .split(",")
                      .map((value) => value.trim().toLowerCase())
                      .filter(Boolean);
                    const next = normalizeControlSettings({
                      ...settings,
                      testMessageRecipients: entries,
                    }).testMessageRecipients;
                    if (next.length !== new Set(entries).size) {
                      setRecipientError(
                        "Use a Gmail address, an exact WhatsApp chat ID, or a private Meet code with the shown prefix. Limit the list to 20 recipients.",
                      );
                      document
                        .getElementById("test-message-recipients")
                        ?.focus();
                      return;
                    }
                    setRecipientError("");
                    setMessageRecipients(next.join(", "));
                    save({ testMessageRecipients: next });
                  }}
                >
                  Save test recipients
                </Button>{" "}
              </FieldGroup>
            </details>
            <div className="dashboard-advanced-links">
              <Button variant="outline" onClick={() => changeView("activity")}>
                View activity and diagnostics
              </Button>
            </div>
            <div className="dashboard-two-column">
              <section className="dashboard-panel">
                <SectionTitle
                  title="Ask questions and use page controls"
                  description="Say hey handsfree before a request to use Groq. Fixed commands also work without a key."
                />
                <div className="dashboard-provider-status">
                  <CheckCircle aria-hidden="true" />
                  <div>
                    <p>
                      {providers
                        ? `${providers.groqKeyCount} Groq keys available`
                        : "Provider status unavailable"}
                    </p>
                    <small>
                      {providers?.sharedKeys
                        ? "Shared project keys are ready. Personal keys are optional."
                        : "Add a key for Groq transcription and hey handsfree requests."}
                    </small>
                  </div>
                </div>
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    void safe(async () => {
                      const keys = groqKeys
                        .map((key) => key.trim())
                        .filter(Boolean);
                      if (!keys.length)
                        throw new Error("Enter at least one Groq key to save.");
                      await request({ type: "SAVE_PROVIDERS", groqKeys: keys });
                      setGroqKeys([""]);
                      setProviders(
                        await request({ type: "GET_PROVIDER_STATUS" }),
                      );
                    }, "Groq keys saved on this device.");
                  }}
                >
                  <FieldGroup>
                    {groqKeys.map((key, index) => (
                      <Field key={index}>
                        <FieldLabel htmlFor={`groq-key-${index}`}>
                          Groq key {index + 1}
                        </FieldLabel>
                        <Input
                          id={`groq-key-${index}`}
                          type="password"
                          autoComplete="off"
                          disabled={locked}
                          value={key}
                          placeholder="gsk_…"
                          onChange={(event) =>
                            setGroqKeys((keys) =>
                              keys.map((value, position) =>
                                position === index ? event.target.value : value,
                              ),
                            )
                          }
                        />
                      </Field>
                    ))}
                    <div className="dashboard-actions">
                      <Button
                        variant="outline"
                        type="button"
                        disabled={locked || groqKeys.length >= 5}
                        onClick={() => setGroqKeys((keys) => [...keys, ""])}
                      >
                        Add another key
                      </Button>
                      <Button type="submit" disabled={locked}>
                        Save Groq keys
                      </Button>
                    </div>
                  </FieldGroup>
                </form>
                <p className="dashboard-hint">
                  Keys rotate when a provider limits a request. Saved key values
                  never come back to this website.
                </p>
                <Button
                  variant="ghost"
                  disabled={locked}
                  onClick={() => {
                    if (
                      window.confirm(
                        "Remove your local Groq keys? Shared project keys will still be available.",
                      )
                    )
                      void safe(async () => {
                        await request({ type: "SAVE_PROVIDERS", groqKeys: [] });
                        setProviders(
                          await request({ type: "GET_PROVIDER_STATUS" }),
                        );
                      }, "Local Groq keys removed.");
                  }}
                >
                  Remove local Groq keys
                </Button>
              </section>
              <section className="dashboard-panel">
                <SectionTitle
                  title="Everyday commands with Jev"
                  description="Jev interprets ordinary phrasing and chooses a supported action. Hey handsfree uses Groq."
                />
                <Badge variant="outline">
                  {providers?.jevConfigured ? "Configured" : "Not configured"}
                </Badge>
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    void safe(async () => {
                      if (!jevKey.trim())
                        throw new Error("Enter a Jev key to save.");
                      await request({
                        type: "SAVE_PROVIDERS",
                        jevKey: jevKey.trim(),
                      });
                      setJevKey("");
                      setProviders(
                        await request({ type: "GET_PROVIDER_STATUS" }),
                      );
                    }, "Jev key saved on this device.");
                  }}
                >
                  <FieldGroup>
                    <Field>
                      <FieldLabel htmlFor="jev-provider">
                        Jev provider
                      </FieldLabel>
                      <Select
                        value={settings.jevProvider}
                        disabled={locked}
                        onValueChange={(jevProvider) =>
                          save({
                            jevProvider: jevProvider as Settings["jevProvider"],
                          })
                        }
                      >
                        <SelectTrigger id="jev-provider" className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectGroup>
                            <SelectItem value="typesafe">TypeSafe</SelectItem>
                            <SelectItem value="openrouter">
                              OpenRouter
                            </SelectItem>
                          </SelectGroup>
                        </SelectContent>
                      </Select>
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="jev-key">Jev key</FieldLabel>
                      <Input
                        id="jev-key"
                        type="password"
                        disabled={locked}
                        autoComplete="off"
                        value={jevKey}
                        placeholder="Enter your Jev key"
                        onChange={(event) => setJevKey(event.target.value)}
                      />
                    </Field>
                    <Button type="submit" disabled={locked}>
                      Save Jev key
                    </Button>
                  </FieldGroup>
                </form>
                <Button
                  variant="ghost"
                  disabled={locked || !providers?.jevConfigured}
                  onClick={() => {
                    if (window.confirm("Remove your local Jev key?"))
                      void safe(async () => {
                        await request({ type: "SAVE_PROVIDERS", jevKey: "" });
                        setProviders(
                          await request({ type: "GET_PROVIDER_STATUS" }),
                        );
                      }, "Jev key removed.");
                  }}
                >
                  Remove Jev key
                </Button>
                <Alert role="note">
                  <Key aria-hidden="true" />
                  <AlertTitle>What your request shares</AlertTitle>
                  <AlertDescription>
                    Jev receives your command, language, up to 50 tab titles and
                    up to 80 page labels when interpreting a paraphrase. Hey
                    handsfree sends your phrase, target labels, page title, URL
                    and up to 12,000 characters of public page text to Groq.
                    Inputs, editable regions, passwords and Handsfree UI are
                    excluded. Camera frames stay local. Find requests highlight;
                    explicit click or open requests activate through the usual
                    safety gates. Answers appear as text here and on the
                    webpage.
                  </AlertDescription>
                </Alert>
                <Button
                  variant="outline"
                  disabled={locked}
                  onClick={() => void safe(() => permit("provider"))}
                >
                  Enable provider access
                </Button>
              </section>
            </div>
          </TabsContent>
          <TabsContent value="activity">
            <section className="dashboard-panel">
              <div className="dashboard-section-heading">
                <div>
                  <h2>Local run activity</h2>
                  <p>
                    Measure your session. Dictated text and keys stay out of the
                    log.
                  </p>
                </div>
                <Badge variant="outline">On this device</Badge>
              </div>
              <div className="dashboard-actions">
                <Button disabled={locked} onClick={() => void safe(loadLogs)}>
                  <ArrowsClockwise
                    data-icon="inline-start"
                    aria-hidden="true"
                  />
                  Refresh activity
                </Button>
                <Button
                  variant="outline"
                  disabled={locked}
                  onClick={() => void safe(exportLogs)}
                >
                  <DownloadSimple data-icon="inline-start" aria-hidden="true" />
                  Export JSON
                </Button>
                <Button
                  variant="outline"
                  disabled={locked}
                  onClick={() => {
                    if (
                      window.confirm(
                        "Clear the local run log? Export it first if you need a copy.",
                      )
                    )
                      void safe(async () => {
                        await request({ type: "CLEAR_LOGS" });
                        setLogs(null);
                      }, "Local activity cleared.");
                  }}
                >
                  Clear activity
                </Button>
              </div>
              <div className="dashboard-markers">
                {[
                  ["task-start", "Mark task start"],
                  ["task-complete", "Mark task complete"],
                  ["selection-error", "Mark selection error"],
                  ["accidental-activation", "Mark accidental activation"],
                ].map(([type, label]) => (
                  <Button
                    key={type}
                    variant="outline"
                    disabled={locked}
                    onClick={() => void safe(() => mark(type))}
                  >
                    {label}
                  </Button>
                ))}
              </div>
              {logs?.events.length ? (
                <div className="dashboard-activity-table">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Time</TableHead>
                        <TableHead>Event</TableHead>
                        <TableHead>Value</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {logs.events
                        .slice()
                        .reverse()
                        .slice(0, 100)
                        .map((event, index) => (
                          <TableRow key={`${event.at}-${index}`}>
                            <TableCell>
                              {new Intl.DateTimeFormat(undefined, {
                                hour: "2-digit",
                                minute: "2-digit",
                                second: "2-digit",
                              }).format(event.at)}
                            </TableCell>
                            <TableCell>
                              {event.type.replaceAll("-", " ")}
                            </TableCell>
                            <TableCell>
                              {event.value === undefined
                                ? "—"
                                : event.value.toFixed(2)}
                            </TableCell>
                          </TableRow>
                        ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <Empty>
                  <EmptyHeader>
                    <EmptyMedia variant="icon">
                      <ChartLine aria-hidden="true" />
                    </EmptyMedia>
                    <EmptyTitle>Start with a session</EmptyTitle>
                    <EmptyDescription>
                      Refresh activity after browsing to inspect events. Mark
                      task boundaries and mistakes during testing.
                    </EmptyDescription>
                  </EmptyHeader>
                </Empty>
              )}
              <p className="dashboard-hint">
                Newest 100 events shown. Export includes the full retained log
                and summary. The extension retains up to 500 events.
              </p>
            </section>
          </TabsContent>
          <TabsContent value="access">
            <section className="dashboard-access">
              <div>
                <h2 tabIndex={-1}>Browser access</h2>
                <p>
                  Page access follows you between websites. Camera and
                  microphone permissions are granted in the extension.
                </p>
              </div>
              <div className="dashboard-actions">
                <FieldGroup>
                  {(["pages", "tabs"] as const).map((kind) => (
                    <SettingSwitch
                      key={kind}
                      id={`permission-${kind}`}
                      label={
                        kind === "pages" ? "Webpage control" : "Tab commands"
                      }
                      hint={
                        permissions
                          ? permissions[kind]
                            ? "Enabled in Chrome"
                            : "Not enabled in Chrome"
                          : "Checking Chrome permissions"
                      }
                      checked={permissions?.[kind] ?? false}
                      disabled={locked || !permissions}
                      onChange={(checked) =>
                        void safe(async () => {
                          if (checked) await permit(kind);
                          else
                            await request({ type: "REVOKE_PERMISSION", kind });
                          setPermissions(
                            await request<PermissionState>({
                              type: "GET_PERMISSIONS",
                            }),
                          );
                        })
                      }
                    />
                  ))}
                  <p className="dashboard-hint">
                    Camera:{" "}
                    {permissions?.camera === "granted"
                      ? "Allowed"
                      : permissions?.camera === "denied"
                        ? "Blocked in Chrome"
                        : "Not checked"}
                    . Microphone:{" "}
                    {permissions?.microphone === "granted"
                      ? "Allowed"
                      : permissions?.microphone === "denied"
                        ? "Blocked in Chrome"
                        : "Not checked"}
                    .
                  </p>
                </FieldGroup>
                <Button
                  variant="outline"
                  disabled={locked}
                  onClick={() =>
                    void safe(() =>
                      request({
                        type: "GRANT_PERMISSIONS",
                        kind: "devices",
                        camera: !settings.voiceOnly,
                        microphone: voiceEnabled(settings),
                        returnHash: "#preferences",
                      }),
                    )
                  }
                >
                  <GearSix data-icon="inline-start" aria-hidden="true" />
                  Review selected devices
                </Button>
              </div>
            </section>
          </TabsContent>
        </Tabs>
      </main>
      <footer className="dashboard-footer">
        Handsfree by Team Loondry.
        <a href="/">
          The web, on your terms.
          <ArrowSquareOut aria-hidden="true" />
        </a>
      </footer>
    </div>
  );
}

function SectionTitle({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="dashboard-section-heading">
      <div>
        <h2 tabIndex={-1}>{title}</h2>
        <p>{description}</p>
      </div>
    </div>
  );
}
function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
function CursorIcon({ style }: { style: Settings["cursorStyle"] }) {
  return (
    <svg
      viewBox="0 0 38 38"
      width="24"
      height="24"
      aria-hidden="true"
      fill="currentColor"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinejoin="round"
    >
      {style === "circle" && <circle cx="19" cy="19" r="7" />}
      {style === "arrow" && <path d={cursorPaths.arrow} />}
      {style === "crosshair" && (
        <path
          d={cursorPaths.crosshair}
          fill="none"
          strokeWidth="2"
          strokeLinecap="round"
        />
      )}
      {style === "spark" && <path d={cursorPaths.spark} />}
    </svg>
  );
}
function SettingSlider({
  id,
  label,
  display,
  value,
  min,
  max,
  step,
  disabled,
  onChange,
}: {
  id: string;
  label: string;
  display: string;
  value: number;
  min: number;
  max: number;
  step: number;
  disabled: boolean;
  onChange: (value: number) => void;
}) {
  const [local, setLocal] = useState(value);
  useEffect(() => setLocal(value), [value]);
  return (
    <Field data-disabled={disabled}>
      <div className="dashboard-setting-label">
        <FieldLabel id={`${id}-label`}>{label}</FieldLabel>
        <output>
          {local === value
            ? display
            : id === "sensitivity" ||
                id === "hand-sensitivity" ||
                id === "scroll-speed"
              ? `${local.toFixed(1)}×`
              : id === "dead-zone"
                ? `${Math.round(local * 100)}%`
                : `${local} ms`}
        </output>
      </div>
      <Slider
        id={id}
        value={[local]}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        aria-labelledby={`${id}-label`}
        onValueChange={([next]) => setLocal(next)}
        onValueCommit={([next]) => onChange(next)}
      />
    </Field>
  );
}
function SettingSwitch({
  id,
  label,
  hint,
  checked,
  disabled,
  onChange,
}: {
  id: string;
  label: string;
  hint: string;
  checked: boolean;
  disabled: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <Field orientation="horizontal" data-disabled={disabled}>
      <FieldContent>
        <FieldLabel htmlFor={id}>{label}</FieldLabel>
        <FieldDescription id={`${id}-hint`}>{hint}</FieldDescription>
      </FieldContent>
      <Switch
        id={id}
        checked={checked}
        disabled={disabled}
        onCheckedChange={onChange}
        aria-describedby={`${id}-hint`}
      />
    </Field>
  );
}
function Calibration({ state }: { state: SessionState }) {
  if (
    state.calibrationProgress === null &&
    !Object.keys(state.calibrationSnapshots || {}).length
  )
    return null;
  const active =
    state.calibrationProgress === null
      ? ""
      : ["center", "left", "right", "up", "down"][
          Math.min(4, Math.floor(state.calibrationProgress * 5))
        ];
  return (
    <div className="dashboard-calibration">
      <div className="dashboard-calibration-photos">
        {["center", "left", "right", "up", "down"].map((stage) => (
          <figure key={stage} data-active={active === stage}>
            {state.calibrationSnapshots?.[stage] ? (
              <img
                src={state.calibrationSnapshots[stage]}
                alt={`${stage} calibration capture`}
                width="160"
                height="120"
              />
            ) : (
              <div aria-hidden="true">
                <UserFocus />
              </div>
            )}
            <figcaption>
              {stage}
              {state.calibrationSnapshots?.[stage]
                ? " · captured"
                : active === stage
                  ? " · hold"
                  : ""}
            </figcaption>
          </figure>
        ))}
      </div>
      <p role="status">
        {state.calibrationStage ||
          "Hold still, then move through your comfortable range."}
      </p>
      {state.calibrationProgress !== null && (
        <Progress
          value={state.calibrationProgress * 100}
          aria-label="Calibration progress"
        />
      )}
    </div>
  );
}
function CommandList({ items }: { items: string[][] }) {
  return (
    <dl className="dashboard-command-list">
      {items.map(([command, meaning]) => (
        <div key={command}>
          <dt>{command}</dt>
          <dd>{meaning}</dd>
        </div>
      ))}
    </dl>
  );
}
function displayOrigin(url: string) {
  try {
    return new URL(url).hostname || url.split(":")[0];
  } catch {
    return "Browser tab";
  }
}
