"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  ArrowRight,
  CheckCircle,
  Microphone,
  SpeakerHigh,
} from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldLabel,
  FieldDescription,
  FieldGroup,
} from "@/components/ui/field";
import { request, subscribeVoice } from "@/lib/extension-bridge";
import {
  inputMethods,
  normalizeControlSettings,
  type Settings,
  type PermissionState,
  type InputMethod,
} from "../../../extension/src/shared";
import { InputChoices, PrimaryPointer, inputLabels } from "./input-choices";

type Guidance = {
  read: (text: string) => Promise<void>;
  stopReading: () => void;
  listening: boolean;
  setListening: (value: boolean) => void;
  speaking: boolean;
  guidanceNotice: string;
  setGuidanceNotice: (value: string) => void;
};
type Props = {
  settings: Settings;
  permissions: PermissionState | null;
  connected: boolean;
  connecting: boolean;
  persist: (patch: Partial<Settings>) => Promise<void>;
  onComplete: () => void;
  onReconnect: () => void;
  onCalibrate: () => Promise<void>;
  guidance: Guidance;
  calibration: ReactNode;
  calibrationStatus: string;
};
const stages = ["Choose controls", "Allow access", "Try your setup"];

export function Onboarding({
  settings,
  permissions,
  connected,
  connecting,
  persist,
  onComplete,
  onReconnect,
  onCalibrate,
  guidance,
  calibration,
  calibrationStatus,
}: Props) {
  const [selected, setSelected] = useState<InputMethod[]>(
    inputMethods(settings),
  );
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const busyRef = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const step = settings.onboardingStep;
  const acted = useRef(false);
  const handler = useRef<(text: string) => void>(() => {});
  const draft = normalizeControlSettings({
    ...settings,
    enabledInputs: selected,
  });
  const needsCamera = selected.some((input) => input !== "voice");
  const needsMicrophone = selected.includes("voice");
  const instructions =
    step === 0
      ? "How would you like to control Handsfree? Choose any combination. Say choose voice, choose head, choose hands, or voice only. Say use head or use hands to choose your primary pointer. Say next when you're ready."
      : step === 1
        ? `Allow the access for your choices. ${needsCamera ? "Head and hands need the camera. " : ""}${needsMicrophone ? "Voice needs the microphone. " : ""}Choose Allow selected devices. Chrome may ask for approval. You can continue without granting access and return later. Say next to continue or go back.`
        : "Your setup is ready to try. Voice commands include scroll down, open a named item, and stop handsfree. Head or hand control uses a short calibration. Choose Try pointer calibration, or say finish setup to continue. You can change preferences from Profile at any time.";
  useEffect(() => {
    setSelected(inputMethods(settings));
  }, [settings.enabledInputs]);
  useEffect(() => {
    heading.current?.focus();
  }, [step]);
  useEffect(() => {
    if (!connected || step !== 0 || acted.current) return;
    const timer = setTimeout(() => {
      if (!acted.current) void guidance.read("Would you like spoken guidance?");
    }, 5000);
    const interacted = () => {
      acted.current = true;
      clearTimeout(timer);
    };
    addEventListener("pointerdown", interacted, true);
    addEventListener("keydown", interacted, true);
    return () => {
      clearTimeout(timer);
      removeEventListener("pointerdown", interacted, true);
      removeEventListener("keydown", interacted, true);
    };
  }, [connected, step, guidance.read]);
  useEffect(() => subscribeVoice((text) => handler.current(text)), []);
  async function perform(work: () => Promise<void>) {
    if (busyRef.current) return;
    busyRef.current = true;
    setWorking(true);
    setError("");
    try {
      await work();
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Setup could not be saved. Reconnect and retry.",
      );
    } finally {
      busyRef.current = false;
      setWorking(false);
    }
  }
  function choose(
    inputs: InputMethod[],
    pointerMode?: Settings["pointerMode"],
  ) {
    acted.current = true;
    setSelected(inputs);
    setError("");
    if (inputs.length)
      void perform(() =>
        persist({
          enabledInputs: inputs,
          ...(pointerMode ? { pointerMode } : {}),
        }),
      );
  }
  function advance() {
    if (!selected.length) {
      setError("Choose at least one way to control Handsfree.");
      document.querySelector<HTMLInputElement>(".input-choice input")?.focus();
      return;
    }
    void perform(async () => {
      guidance.stopReading();
      if (step === 2) {
        await persist({
          enabledInputs: selected,
          onboardingCompleted: true,
          onboardingStep: 2,
        });
        guidance.setListening(false);
        onComplete();
      } else {
        await persist({ enabledInputs: selected, onboardingStep: step + 1 });
        if (settings.spokenFeedback)
          void guidance.read(
            step === 0
              ? "Allow access. Choose Allow selected devices to enable only the devices for your setup. You can continue and set this up later."
              : "Try your setup. Try pointer calibration, or say finish setup.",
          );
      }
    });
  }
  function allowDevices(camera = needsCamera, microphone = needsMicrophone) {
    void perform(async () => {
      guidance.stopReading();
      await persist({ enabledInputs: selected.length ? selected : ["voice"] });
      await request({
        type: "GRANT_PERMISSIONS",
        kind: "devices",
        camera,
        microphone,
        returnHash: "#setup",
      });
    });
  }
  function listen() {
    if (!connected) {
      guidance.setGuidanceNotice(
        "Connect your extension to use voice during setup.",
      );
      return;
    }
    if (permissions?.microphone !== "granted") {
      allowDevices(false, true);
      return;
    }
    if (!selected.includes("voice")) choose([...selected, "voice"]);
    guidance.setListening(!guidance.listening);
  }
  handler.current = (text) => {
    if (!guidance.listening) return;
    acted.current = true;
    const phrase = text
      .toLowerCase()
      .trim()
      .replace(/[.!?,]+$/g, "")
      .replace(/\s+/g, " ");
    if (/^(next|continue|finish setup|save preferences)$/.test(phrase)) {
      advance();
      return;
    }
    if (/^(go back|back)$/.test(phrase)) {
      if (step > 0) void perform(() => persist({ onboardingStep: step - 1 }));
      return;
    }
    if (
      /^(repeat|read setup|read setup aloud|yes|yes please|spoken guidance)$/.test(
        phrase,
      )
    ) {
      void perform(async () => {
        await persist({ spokenFeedback: true });
        void guidance.read(instructions);
      });
      return;
    }
    if (/^(stop reading|mute|no thanks)$/.test(phrase)) {
      guidance.stopReading();
      return;
    }
    if (/^(stop listening|stop handsfree)$/.test(phrase)) {
      guidance.setListening(false);
      guidance.stopReading();
      return;
    }
    if (/^(allow selected devices|allow microphone)$/.test(phrase)) {
      allowDevices(
        phrase === "allow microphone" ? false : needsCamera,
        phrase === "allow microphone" ? true : needsMicrophone,
      );
      return;
    }
    if (phrase === "voice only") {
      choose(["voice"]);
      return;
    }
    const match =
      /^(choose|add|remove|use) (voice|head|face|hands?|one|two|three)$/.exec(
        phrase,
      );
    if (match) {
      const input: InputMethod = /^(voice|one)$/.test(match[2])
        ? "voice"
        : /^(head|face|two)$/.test(match[2])
          ? "face"
          : "hand";
      const next =
        match[1] === "remove"
          ? selected.filter((value) => value !== input)
          : [...new Set([...selected, input])];
      choose(next, match[1] === "use" && input !== "voice" ? input : undefined);
    }
  };
  return (
    <section
      className="onboarding"
      aria-busy={working}
      onPointerDown={() => {
        acted.current = true;
      }}
    >
      <div className="onboarding-top">
        <p className="dashboard-overline">Make yourself comfortable</p>
        <span>Step {step + 1} of 3</span>
      </div>
      <ol className="onboarding-progress" aria-label="Setup progress">
        {stages.map((stage, index) => (
          <li
            key={stage}
            aria-current={index === step ? "step" : undefined}
            data-current={index === step}
            data-complete={index < step}
          >
            <span aria-hidden="true">
              {index < step ? <CheckCircle /> : index + 1}
            </span>
            {stage}
          </li>
        ))}
      </ol>
      <div className="onboarding-heading">
        <h1 ref={heading} tabIndex={-1}>
          {step === 0
            ? "What feels comfortable for you?"
            : step === 1
              ? "A little access to get started."
              : "Ready when you are."}
        </h1>
        <p>
          {step === 0
            ? "Choose how you'd like to browse. Combine controls, take your time, and change them whenever you need."
            : step === 1
              ? "Choose only the access your controls need. You can come back to this later."
              : "Try your controls, or head straight to your session. Your preferences stay on this device."}
        </p>
      </div>
      <div className="onboarding-guidance">
        <Button
          variant="outline"
          onClick={() => {
            acted.current = true;
            void perform(async () => {
              if (connected) await persist({ spokenFeedback: true });
              void guidance.read(instructions);
            });
          }}
        >
          <SpeakerHigh data-icon="inline-start" aria-hidden="true" />
          Read setup aloud
        </Button>
        <Button variant="ghost" onClick={guidance.stopReading}>
          Stop reading
        </Button>
        <Button variant="outline" onClick={listen} disabled={working}>
          <Microphone data-icon="inline-start" aria-hidden="true" />
          {guidance.listening ? "Stop listening" : "Listen for setup commands"}
        </Button>
        <p role="status">
          {guidance.guidanceNotice ||
            (guidance.listening
              ? "Listening on this screen. Say next, go back, or repeat."
              : "You can also use your keyboard or screen reader.")}
        </p>
      </div>
      {!connected && (
        <div className="onboarding-connect" role="status">
          <p>
            {connecting
              ? "Connecting to your saved setup…"
              : "Open this dashboard from the Handsfree extension to save your preferences."}
          </p>
          <Button variant="outline" disabled={connecting} onClick={onReconnect}>
            Reconnect extension
          </Button>
          <a href="/#quick-guide">Read the installation guide</a>
        </div>
      )}
      {step === 0 && (
        <div className="onboarding-body">
          <InputChoices
            selected={selected}
            onChange={choose}
            disabled={working || !connected}
          />
          <PrimaryPointer
            settings={draft}
            disabled={working || !connected}
            onChange={(pointerMode) =>
              void perform(() =>
                persist({ enabledInputs: selected, pointerMode }),
              )
            }
          />
          <FieldGroup>
            <Field>
              <label className="guidance-choice">
                <input
                  type="checkbox"
                  checked={settings.spokenFeedback}
                  disabled={working || !connected}
                  onChange={(event) =>
                    void perform(() =>
                      persist({ spokenFeedback: event.target.checked }),
                    )
                  }
                />
                <span>
                  Read guidance and results aloud
                  <span className="input-choice-hint">
                    Leave this off if you prefer your screen reader's voice.
                  </span>
                </span>
              </label>
            </Field>
          </FieldGroup>
        </div>
      )}
      {step === 1 && (
        <div className="onboarding-body">
          <dl className="onboarding-access-list">
            {needsCamera && (
              <AccessRow
                label="Camera"
                hint="For head and hand movement"
                state={permissions?.camera}
              />
            )}
            {needsMicrophone && (
              <AccessRow
                label="Microphone"
                hint="For voice commands"
                state={permissions?.microphone}
              />
            )}
          </dl>
          {(!needsCamera || permissions?.camera === "granted") &&
          (!needsMicrophone || permissions?.microphone === "granted") ? (
            <p className="onboarding-ready">
              <CheckCircle aria-hidden="true" />
              Your selected devices are allowed.
            </p>
          ) : (
            <>
              <Button
                variant="outline"
                disabled={!connected || working}
                onClick={() => allowDevices()}
              >
                Allow selected devices
              </Button>
              <p className="dashboard-hint">
                Chrome opens a small access window for the extension. Choose
                Return to Handsfree when you're done.
              </p>
            </>
          )}
          <div className="onboarding-page-access">
            <p>
              <strong>Webpage control</strong>
              <br />
              Allow Handsfree to work across the websites you visit.
            </p>
            <Button
              variant="outline"
              disabled={!connected || working || permissions?.pages}
              onClick={() =>
                void perform(async () => {
                  guidance.stopReading();
                  await request({
                    type: "GRANT_PERMISSIONS",
                    kind: "pages",
                    returnHash: "#setup",
                  });
                })
              }
            >
              {permissions?.pages
                ? "Webpage access allowed"
                : "Allow webpage control"}
            </Button>
          </div>
          {needsMicrophone && (
            <>
              <Field>
                <FieldLabel htmlFor="setup-speech">
                  Where should voice be processed?
                </FieldLabel>
                <select
                  id="setup-speech"
                  className="onboarding-select"
                  disabled={!connected || working}
                  value={settings.speechMode}
                  onChange={(event) =>
                    void perform(() =>
                      persist({
                        speechMode: event.target
                          .value as Settings["speechMode"],
                      }),
                    )
                  }
                >
                  <option value="browser">Online speech</option>
                  <option value="local">On-device speech</option>
                </select>
                <FieldDescription>
                  {settings.speechMode === "browser"
                    ? "Chrome may process audio online. Groq can receive recordings if Chrome speech is unavailable. This applies when you start listening."
                    : "Audio stays on this device. Chrome needs a supported language pack."}
                </FieldDescription>
              </Field>
              {settings.speechMode === "local" && (
                <Button
                  variant="outline"
                  disabled={!connected || working}
                  onClick={() =>
                    void perform(async () => {
                      await request({ type: "INSTALL_SPEECH_PACK" });
                    })
                  }
                >
                  Install local speech
                </Button>
              )}
            </>
          )}
        </div>
      )}
      {step === 2 && (
        <div className="onboarding-body">
          <p className="onboarding-summary">
            {selected.map((input) => inputLabels[input]).join(" + ")}
            {needsCamera
              ? `. Starting with ${inputLabels[draft.pointerMode].toLowerCase()}.`
              : ". Camera stays off."}
          </p>
          {needsMicrophone && (
            <div className="onboarding-practice">
              <h2>Try a few words</h2>
              <p>
                On a webpage, say “scroll down” or “open” followed by an item
                name. Say “stop Handsfree” to release the microphone.
              </p>
            </div>
          )}
          {needsCamera && (
            <div className="onboarding-practice">
              <h2>Find your comfortable movement</h2>
              <p>
                Calibration measures your center, left, right, up, and down
                positions. Small movements are enough. You can retry any time.
              </p>
              <Button
                variant="outline"
                disabled={
                  !connected || working || permissions?.camera !== "granted"
                }
                onClick={() => void perform(onCalibrate)}
              >
                Try pointer calibration
              </Button>
              <p className="dashboard-hint">
                Calibration is optional during setup. You can complete it from
                Pointer preferences.
              </p>
            </div>
          )}
          <p role="status" className="dashboard-hint">
            {calibrationStatus}
          </p>
          {calibration}
        </div>
      )}
      <p className="onboarding-error" role="alert">
        {error}
      </p>
      <div className="onboarding-footer">
        <Button
          variant="ghost"
          disabled={step === 0 || working || !connected}
          onClick={() =>
            void perform(() => persist({ onboardingStep: step - 1 }))
          }
        >
          Go back
        </Button>
        <Button disabled={!connected || working} onClick={advance}>
          {working ? "Saving…" : step === 2 ? "Finish setup" : "Continue"}
          <ArrowRight data-icon="inline-end" aria-hidden="true" />
        </Button>
      </div>
      <p className="onboarding-reassurance">
        There's no rush. You can adjust your setup from Profile at any time.
      </p>
    </section>
  );
}
function AccessRow({
  label,
  hint,
  state,
}: {
  label: string;
  hint: string;
  state?: string;
}) {
  return (
    <div>
      <dt>
        {label}
        <span>{hint}</span>
      </dt>
      <dd>
        {state === "granted"
          ? "Allowed"
          : state === "denied"
            ? "Blocked in Chrome"
            : state === "prompt"
              ? "Not requested"
              : "Not checked yet"}
      </dd>
    </div>
  );
}
