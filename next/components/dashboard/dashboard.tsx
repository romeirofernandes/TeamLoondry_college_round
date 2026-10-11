"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowSquareOut,
  ArrowsClockwise,
  ChartLine,
  DownloadSimple,
  GearSix,
  Hand,
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
import { GestureConfig } from "./gesture-config";
import { Routines } from "./routines";

type BrowserTab = { id: number; title: string; url: string; active: boolean };
type RunLog = { events: MetricEvent[]; summary: Record<string, unknown> };
const views = [
  { id: "overview", label: "Session", icon: Monitor },
  { id: "preferences", label: "Controls", icon: SlidersHorizontal },
  { id: "access", label: "Permissions", icon: Plugs },
  { id: "setup", label: "Setup", icon: UserFocus },
];
const viewAliases: Record<string, string> = {
  tabs: "overview",
  pointer: "preferences",
  gestures: "preferences",
  voice: "preferences",
  routines: "preferences",
  providers: "access",
  activity: "access",
  help: "overview",
  docs: "overview",
};
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
  const [permissions, setPermissions] = useState<PermissionState | null>(null);
  const [pausePhrase, setPausePhrase] = useState(defaults.pausePhrase);
  const [messageRecipients, setMessageRecipients] = useState("");
  const [resumePhrase, setResumePhrase] = useState(defaults.resumePhrase);
  const [tabs, setTabs] = useState<BrowserTab[]>([]);
  const [tabsLoaded, setTabsLoaded] = useState(false);
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
    if (
      calibrationPose &&
      settings.spokenFeedback &&
      (settings.onboardingCompleted || settings.setupGuidance === "voice")
    )
      void guidance.read(
        state.calibrationStage.split(" · ")[2]?.split(". Capturing")[0] ||
          calibrationPose,
      );
  }, [
    calibrationPose,
    settings.spokenFeedback,
    settings.onboardingCompleted,
    settings.setupGuidance,
    guidance.read,
  ]);

  const refresh = useCallback(async () => {
    const attempt = ++generation.current;
    refreshing.current = true;
    setConnecting(true);
    try {
      const [session, preferences, grants] = await Promise.all([
        request<SessionState>({ type: "GET_STATE" }),
        request<Settings>({ type: "GET_SETTINGS" }),
        request<PermissionState>({ type: "GET_PERMISSIONS" }),
      ]);
      if (attempt !== generation.current) return;
      setState(session);
      setSettings(preferences);
      settingsRef.current = preferences;
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
      if (views.some((item) => item.id === id) || viewAliases[id]) setView(id);
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
  const activeView = viewAliases[view] || view;
  const profileView = ["preferences", "access"].includes(activeView);
  const navigationViews = views.filter((item) =>
    profileView
      ? ["preferences", "access"].includes(item.id)
      : item.id === "overview",
  );
  useEffect(() => {
    if (showSetup || !viewAliases[view]) return;
    const section = document.querySelector<HTMLDetailsElement>(
      `[data-settings-section="${view}"]`,
    );
    if (section) {
      section.open = true;
      section.querySelector("summary")?.focus();
    }
  }, [view, showSetup]);
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
      "open controls": "preferences",
      "open permissions": "access",
      "open pointer": "pointer",
      "open voice": "voice",
      "open gestures": "gestures",
      "open routines": "routines",
      "open browser access": "access",
      "show tabs": "tabs",
      "back to session": "overview",
      "open advanced": "access",
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
    if (activeView === "preferences") {
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
      ? "Profile and preferences. Say open controls, open pointer, open voice, open permissions, or back to session. In Controls, say choose voice, choose head, choose hands, or voice only. Say use head or use hands to switch your primary pointer."
      : "Your session. Say start session, pause session, resume session, stop Handsfree, show tabs, open profile. Browsing commands work when you return to a webpage.";
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
      setError("Select Voice in Controls before listening on this screen.");
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
      returnHash: "#access",
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
            onClick={() => changeView(profileView ? "overview" : "preferences")}
            aria-label={
              profileView ? "Back to session" : "Profile and preferences"
            }
          >
            <UserCircle data-icon="inline-start" aria-hidden="true" />
            {profileView ? "Back to session" : "Profile"}
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
              {profileView ? "Make it yours" : "Dashboard"}
            </p>
            <h1>{profileView ? "Profile and preferences" : "Your session"}</h1>
            <p className="dashboard-lead">
              {inputMethods(settings)
                .map((input) => inputLabels[input])
                .join(" · ")}
              .{" "}
              {settings.voiceOnly
                ? "Camera stays off."
                : `${inputLabels[settings.pointerMode]} pointer.`}
            </p>
          </div>
          <div className="dashboard-session">
            <Badge variant="secondary">
              <span className="dashboard-status-dot" aria-hidden="true" />
              {status}
            </Badge>
            {!profileView && sessionActions}
            {!profileView && (
              <p className="dashboard-shortcut">
                Alt + Shift + P to pause or resume
              </p>
            )}
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
        <Tabs
          value={activeView}
          onValueChange={changeView}
          className="dashboard-tabs"
        >
          <TabsList
            hidden={!profileView}
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
            <div className="dashboard-settings-stack">
              <section className="dashboard-preferences-panel">
                <SectionTitle
                  title="Your controls"
                  description="Choose how you browse. Changes save automatically on this device."
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
                  id="spoken-feedback"
                  label="Read results aloud"
                  hint="Optional spoken feedback during browsing."
                  checked={settings.spokenFeedback}
                  disabled={locked}
                  onChange={(checked) => save({ spokenFeedback: checked })}
                />
              </section>
              <details
                className="dashboard-settings-section"
                data-settings-section="routines"
              >
                <summary>Voice routines</summary>
                <div className="dashboard-settings-content">
                  <Routines running={running} disabled={locked} />
                </div>
              </details>
              <details
                className="dashboard-settings-section"
                data-settings-section="pointer"
              >
                <summary>Pointer & calibration</summary>
                <div className="dashboard-settings-content">
                  <div className="dashboard-two-column">
                    <section className="dashboard-panel">
                      <SectionTitle
                        title="Make pointing feel natural"
                        description="Tune your selected pointer. Add another control from Controls whenever you need."
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
                              disabled={
                                !inputMethods(settings).includes("face")
                              }
                            >
                              <UserFocus aria-hidden="true" />
                              Head movement
                            </ToggleGroupItem>
                            <ToggleGroupItem
                              value="hand"
                              disabled={
                                !inputMethods(settings).includes("hand")
                              }
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
                            {(
                              ["circle", "arrow", "crosshair", "spark"] as const
                            ).map((style) => (
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
                            ))}
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
                            onChange={(value) =>
                              save({ handSensitivity: value })
                            }
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
                          onChange={(value) =>
                            save({ scrollSensitivity: value })
                          }
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
                          onChange={(checked) =>
                            save({ dwellEnabled: checked })
                          }
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
                        <UserFocus
                          data-icon="inline-start"
                          aria-hidden="true"
                        />
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
                          Follow the left, right, up and down prompts. Hold each
                          pose while its photo is captured. Choose your
                          comfortable limit in each direction.
                        </li>
                        <li>
                          {settings.pointerMode === "face"
                            ? "These measurements turn small head offsets into cursor speed. Return to center to stop in place."
                            : "Your small palm movement area maps onto the full webpage. Hand sensitivity makes that area smaller or larger."}
                        </li>
                      </ol>
                      <p className="dashboard-hint">
                        Selections pause during calibration. Low confidence and
                        tracking loss freeze movement and block clicks. Return
                        to view, hold still briefly, then review the highlighted
                        target. Recalibrate after a posture change if needed.
                        Voice scrolling works before camera calibration. Photos
                        stay in this session on your device and clear when you
                        stop. Only landmark measurements are saved for future
                        sessions.
                      </p>
                    </section>
                  </div>
                </div>
              </details>
              <details
                className="dashboard-settings-section"
                data-settings-section="gestures"
              >
                <summary>Gesture shortcuts</summary>
                <div className="dashboard-settings-content">
                  <GestureConfig
                    running={running}
                    voiceOnly={settings.voiceOnly}
                    tabsPermission={permissions?.tabs ?? false}
                    onNeedTabs={() =>
                      void safe(
                        () => permit("tabs"),
                        "Enable tab access to include your open websites.",
                      )
                    }
                  />
                </div>
              </details>
              <details
                className="dashboard-settings-section"
                data-settings-section="voice"
              >
                <summary>Speech & language</summary>
                <div className="dashboard-settings-content">
                  <div className="dashboard-two-column">
                    <section className="dashboard-panel">
                      <SectionTitle
                        title="Speak comfortably"
                        description="Choose a language and where speech is processed."
                      />
                      <FieldGroup>
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
                                speechMode:
                                  speechMode as Settings["speechMode"],
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
                            Changing language or processing restarts listening
                            in an active session.
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
                          {state.dictating
                            ? "Dictation on"
                            : "Listening status"}
                        </p>
                        <p>
                          {connected
                            ? state.voice
                            : "Connect the extension first."}
                        </p>
                        <p>
                          {connected
                            ? state.interimTranscript ||
                              (state.lastHeard?.match(/[\p{L}\p{N}]/u) ? state.lastHeard : "") ||
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
                              onChange={(event) =>
                                setPausePhrase(event.target.value)
                              }
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
                              These exact phrases work during dictation too.
                              While paused, the microphone listens only for
                              session controls. Stop releases it.
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
                                document
                                  .getElementById("pause-phrase")
                                  ?.focus();
                                return;
                              }
                              setPhraseError("");
                              save({
                                pausePhrase: pause,
                                resumePhrase: resume,
                              });
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
                </div>
              </details>
            </div>
          </TabsContent>
          <TabsContent value="overview">
            <div className="dashboard-two-column">
              <section className="dashboard-panel">
                <div className="dashboard-section-heading">
                  <div>
                    <h2 tabIndex={-1}>Pointer</h2>
                    <p>
                      {settings.voiceOnly
                        ? "Voice control is ready without a camera."
                        : "Calibrate here or check your camera position."}
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
                {!settings.voiceOnly && (
                  <details className="dashboard-disclosure dashboard-preview-disclosure">
                    <summary>Camera preview</summary>
                    <CameraPreview
                      running={running && !settings.voiceOnly}
                      voiceOnly={settings.voiceOnly}
                    />
                  </details>
                )}
                <div className="dashboard-preview-footer">
                  <span>
                    {settings.voiceOnly ? "Camera off" : connected ? state.camera : "Camera not connected"}
                  </span>
                  {connected && /denied|unavailable|blocked/i.test(state.camera) && (
                    <Button variant="outline" onClick={() => changeView("access")}>
                      Open permissions
                    </Button>
                  )}
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
                    <h2>Voice activity</h2>
                    <p>{connected ? state.voice : "Connect your extension to use voice."}</p>
                  </div>
                </div>

                <div className="dashboard-transcript">
                  <p className="dashboard-small-label">
                    {state.dictating ? "Dictation on" : "Last heard"}
                  </p>
                  <p>
                    {connected
                      ? state.interimTranscript ||
                        (state.lastHeard?.match(/[\p{L}\p{N}]/u) ? state.lastHeard : "") ||
                        "Say a command after starting a session."
                      : "Connect the extension to see voice activity."}
                  </p>
                </div>
                <details className="dashboard-assistance">
                  <summary>Spoken help</summary>
                  <div className="dashboard-screen-tools">
                    <Button
                      variant="outline"
                      onClick={() =>
                        guidance.speaking
                          ? guidance.stopReading()
                          : void guidance.read(screenInstructions())
                      }
                    >
                      <SpeakerHigh data-icon="inline-start" aria-hidden="true" />
                      {guidance.speaking ? "Stop reading" : "Read this screen"}
                    </Button>
                    {voiceEnabled(settings) && (
                      <Button
                        variant="outline"
                        disabled={locked}
                        onClick={listenOnScreen}
                      >
                        <Microphone data-icon="inline-start" aria-hidden="true" />
                        {guidance.listening
                          ? "Stop listening"
                          : "Listen for dashboard commands"}
                      </Button>
                    )}
                    <p role="status">
                      {guidance.guidanceNotice ||
                        (guidance.listening ? "Listening for dashboard commands." : "")}
                    </p>
                  </div>
                </details>
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
                  </dl>
                </details>
                {commandForm}
              </section>
            </div>
            <div className="dashboard-session-tabs">
              <section className="dashboard-panel">
                <SectionTitle
                  title="Open tabs"
                  description="Refresh, then choose a tab to switch to."
                />
                <div className="dashboard-actions">
                  {!permissions?.tabs && (
                    <Button
                      variant="outline"
                      disabled={locked}
                      onClick={() => void safe(() => permit("tabs"))}
                    >
                      Enable tab access
                    </Button>
                  )}
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
                        Use Refresh tabs to load your open pages.
                      </EmptyDescription>
                    </EmptyHeader>
                  </Empty>
                )}
              </section>
            </div>
          </TabsContent>

          <TabsContent value="access">
            <section className="dashboard-settings-stack">
              <SectionTitle
                title="Permissions"
                description="Manage access for your selected controls."
              />
              <div className="dashboard-two-column">
                <section className="dashboard-panel">
                  <SectionTitle
                    title="Browser access"
                    description="Choose what Handsfree can control in Chrome."
                  />
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
                              ? "Allowed"
                              : "Not allowed"
                            : "Checking Chrome permissions"
                        }
                        checked={permissions?.[kind] ?? false}
                        disabled={locked || !permissions}
                        onChange={(checked) =>
                          void safe(async () => {
                            if (checked) await permit(kind);
                            else
                              await request({
                                type: "REVOKE_PERMISSION",
                                kind,
                              });
                            setPermissions(
                              await request<PermissionState>({
                                type: "GET_PERMISSIONS",
                              }),
                            );
                          })
                        }
                      />
                    ))}
                  </FieldGroup>
                  <div className="dashboard-command-permission">
                    <div>
                      <p>Natural-language commands</p>
                      <small>
                        {permissions?.provider ? "Allowed" : "Not allowed"}
                      </small>
                    </div>
                    {!permissions?.provider && (
                      <Button
                        variant="outline"
                        disabled={locked}
                        onClick={() => void safe(() => permit("provider"))}
                      >
                        Enable
                      </Button>
                    )}
                  </div>
                </section>
                <section className="dashboard-panel">
                  <SectionTitle
                    title="Camera & microphone"
                    description="Device permissions are granted in the extension."
                  />
                  <dl className="dashboard-device-status">
                    {(["camera", "microphone"] as const).map((device) => (
                      <div key={device}>
                        <dt>{device === "camera" ? "Camera" : "Microphone"}</dt>
                        <dd>
                          {permissions?.[device] === "granted"
                            ? "Allowed"
                            : permissions?.[device] === "denied"
                              ? "Blocked in Chrome"
                              : permissions?.[device] === "prompt"
                                ? "Not requested"
                                : "Not checked"}
                        </dd>
                      </div>
                    ))}
                  </dl>
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
                          returnHash: "#access",
                        }),
                      )
                    }
                  >
                    <GearSix data-icon="inline-start" aria-hidden="true" />
                    Manage device access
                  </Button>
                </section>
              </div>
              <details className="dashboard-disclosure">
                <summary>Message sending for testing</summary>
                <FieldGroup>
                  <Field>
                    <FieldLabel htmlFor="test-message-recipients">
                      Owned test recipients for Gmail and Meet
                    </FieldLabel>
                    <FieldDescription id="test-recipients-help">
                      Gmail and Meet sending requires an exact recipient here
                      and a separate voice confirmation. WhatsApp messages use
                      the currently open chat and always require voice
                      confirmation. Only add recipients and private meetings you
                      own or have permission to test.
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
                          "Use a Gmail address or a private Meet code with the shown prefix. Limit the list to 20 recipients.",
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
              <details
                className="dashboard-settings-section"
                data-settings-section="activity"
              >
                <summary>Activity & diagnostics</summary>
                <div className="dashboard-settings-content">
                  <section className="dashboard-panel">
                    <div className="dashboard-section-heading">
                      <div>
                        <h2>Local run activity</h2>
                        <p>
                          Measure your session. Dictated text and keys stay out
                          of the log.
                        </p>
                      </div>
                      <Badge variant="outline">On this device</Badge>
                    </div>
                    <div className="dashboard-actions">
                      <Button
                        disabled={locked}
                        onClick={() => void safe(loadLogs)}
                      >
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
                        <DownloadSimple
                          data-icon="inline-start"
                          aria-hidden="true"
                        />
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
                            Refresh activity after browsing to inspect events.
                          </EmptyDescription>
                        </EmptyHeader>
                      </Empty>
                    )}
                    <p className="dashboard-hint">
                      Newest 100 events shown. Export includes the full retained
                      log and summary. The extension retains up to 500 events.
                    </p>
                  </section>
                </div>
              </details>
              <details className="dashboard-settings-section">
                <summary>Run setup again</summary>
                <p className="dashboard-hint">
                  Revisit your controls and device access.
                </p>
                <Button
                  variant="outline"
                  disabled={locked}
                  onClick={() => {
                    save({ onboardingStep: 0 });
                    changeView("setup");
                  }}
                >
                  Replay setup
                </Button>
              </details>
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
function displayOrigin(url: string) {
  try {
    return new URL(url).hostname || url.split(":")[0];
  } catch {
    return "Browser tab";
  }
}
