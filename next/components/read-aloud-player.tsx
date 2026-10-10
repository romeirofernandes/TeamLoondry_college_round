"use client";

import { useEffect, useRef, useState } from "react";
import { Pause, Play, SpeakerHigh, Stop, X } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";

type ReadMode = "idle" | "reading" | "paused" | "done";
type VoiceOption = { key: string; voice: SpeechSynthesisVoice };

function uniqueVoiceOptions(voices: SpeechSynthesisVoice[]): VoiceOption[] {
  const occurrences = new Map<string, number>();
  return voices.map((voice) => {
    const base = JSON.stringify([voice.voiceURI, voice.lang, voice.name]);
    const occurrence = occurrences.get(base) ?? 0;
    occurrences.set(base, occurrence + 1);
    return { key: JSON.stringify([voice.voiceURI, voice.lang, voice.name, occurrence]), voice };
  });
}

function preferredVoice(options: VoiceOption[]) {
  const english = options.filter(({ voice }) =>
    voice.lang.toLowerCase().startsWith("en"),
  );
  const candidates = english.length ? english : options;
  const naturalVoiceName =
    /natural|premium|enhanced|neural|siri|samantha|ava|zoe|allison|aria|serena|karen|tessa|moira/i;

  return [...candidates].sort((a, b) => {
    const score = ({ voice }: VoiceOption) =>
      Number(voice.localService) * 20 +
      Number(voice.default) * 2 +
      Number(voice.lang.toLowerCase() === "en-us") * 2 +
      Number(naturalVoiceName.test(voice.name)) * 5;
    return score(b) - score(a);
  })[0];
}

function readableBlocks() {
  const main = document.querySelector("main");
  if (!main) return [];

  return Array.from(
    main.querySelectorAll<HTMLElement>("h1, h2, h3, p, li, blockquote, figcaption"),
  ).filter((element) => {
    if (element.closest(".read-aloud-player")) return false;
    if (element.closest('[aria-hidden="true"]')) return false;
    if (!element.getClientRects().length) return false;
    return (element.innerText || element.textContent || "").trim().length > 0;
  });
}

export function ReadAloudPlayer() {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<ReadMode>("idle");
  const [status, setStatus] = useState(
    "Uses the best available English voice on this device.",
  );
  const [voices, setVoices] = useState<VoiceOption[]>([]);
  const [voiceKey, setVoiceKey] = useState("");
  const [rate, setRate] = useState(0.95);
  const queue = useRef<HTMLElement[]>([]);
  const currentBlock = useRef<HTMLElement | null>(null);
  const position = useRef(0);
  const runId = useRef(0);
  const voiceKeyRef = useRef("");
  const rateRef = useRef(0.95);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        if (mode === "reading") {
          window.speechSynthesis.pause();
          setMode("paused");
          setStatus("Reading paused.");
        }
        setOpen(false);
        triggerRef.current?.focus();
      }
    }
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [mode, open]);

  useEffect(() => {
    if (!("speechSynthesis" in window)) {
      setStatus("Read aloud is not supported by this browser.");
      return;
    }
    const synth = window.speechSynthesis;
    const updateVoices = () => {
      const availableVoices = synth.getVoices();
      const englishVoices = availableVoices.filter((voice) =>
        voice.lang.toLowerCase().startsWith("en"),
      );
      const nextVoices = uniqueVoiceOptions(
        englishVoices.length ? englishVoices : availableVoices,
      );
      setVoices(nextVoices);
      if (!voiceKeyRef.current) {
        const preferred = preferredVoice(nextVoices);
        if (preferred) {
          voiceKeyRef.current = preferred.key;
          setVoiceKey(preferred.key);
          setStatus(
            !englishVoices.length
              ? `No English system voice was found. Selected ${preferred.voice.name}.`
              : preferred.voice.localService
                ? `Selected ${preferred.voice.name}, a voice available on this device.`
                : `Selected ${preferred.voice.name}. This voice may process text online.`,
          );
        } else {
          setStatus("No English system voice was found. Using the browser default.");
        }
      }
    };

    updateVoices();
    synth.addEventListener("voiceschanged", updateVoices);
    return () => {
      synth.removeEventListener("voiceschanged", updateVoices);
      runId.current += 1;
      synth.cancel();
      currentBlock.current?.classList.remove("is-being-read");
    };
  }, []);

  function speakNext(run: number) {
    if (run !== runId.current) return;
    const block = queue.current[position.current];
    if (!block) {
      currentBlock.current?.classList.remove("is-being-read");
      currentBlock.current = null;
      setMode("done");
      setStatus("Finished reading the page.");
      return;
    }

    currentBlock.current?.classList.remove("is-being-read");
    currentBlock.current = block;
    block.classList.add("is-being-read");
    const text = (block.innerText || block.textContent || "").replace(/\s+/g, " ").trim();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = rateRef.current;
    const selectedVoice = voices.find((option) => option.key === voiceKeyRef.current);
    if (selectedVoice) utterance.voice = selectedVoice.voice;

    utterance.onend = () => {
      if (run !== runId.current) return;
      position.current += 1;
      speakNext(run);
    };
    utterance.onerror = (event) => {
      if (run !== runId.current || event.error === "canceled") return;
      currentBlock.current?.classList.remove("is-being-read");
      currentBlock.current = null;
      setMode("idle");
      setStatus("The selected voice could not read this text. Try another voice.");
    };
    window.speechSynthesis.speak(utterance);
  }

  function startReading() {
    if (
      !("speechSynthesis" in window) ||
      typeof SpeechSynthesisUtterance === "undefined"
    ) {
      setStatus("Read aloud is not supported by this browser.");
      return;
    }
    const blocks = readableBlocks();
    if (!blocks.length) {
      setStatus("There is no page text available to read right now.");
      return;
    }

    window.speechSynthesis.cancel();
    currentBlock.current?.classList.remove("is-being-read");
    queue.current = blocks;
    position.current = 0;
    const run = ++runId.current;
    setMode("reading");
    setStatus("Reading the page. The current text is highlighted.");
    speakNext(run);
  }

  function togglePlayback() {
    if (mode === "reading") {
      window.speechSynthesis.pause();
      setMode("paused");
      setStatus("Reading paused.");
    } else if (mode === "paused") {
      window.speechSynthesis.resume();
      setMode("reading");
      setStatus("Reading resumed.");
    } else {
      startReading();
    }
  }

  function togglePanel() {
    if (open && mode === "reading") {
      window.speechSynthesis.pause();
      setMode("paused");
      setStatus("Reading paused.");
    }
    setOpen((currentlyOpen) => !currentlyOpen);
  }

  function stopReading() {
    runId.current += 1;
    queue.current = [];
    position.current = 0;
    currentBlock.current?.classList.remove("is-being-read");
    currentBlock.current = null;
    window.speechSynthesis.cancel();
    setMode("idle");
    setStatus("Reading stopped.");
  }

  function selectVoice(nextKey: string) {
    voiceKeyRef.current = nextKey;
    setVoiceKey(nextKey);
    const selected = voices.find((option) => option.key === nextKey);
    if (selected) {
      const { voice } = selected;
      setStatus(
        voice.localService
          ? `Selected ${voice.name}, a voice available on this device.`
          : `Selected ${voice.name}. This voice may process text online.`,
      );
    }
  }

  function changeRate(nextRate: number) {
    rateRef.current = nextRate;
    setRate(nextRate);
  }

  return (
    <div className="read-aloud-nav">
      <Button
        ref={triggerRef}
        className="read-aloud-trigger"
        variant="outline"
        size="default"
        aria-expanded={open}
        aria-controls="read-aloud-panel"
        aria-label={open ? "Close listen to page controls" : "Listen to this page"}
        onClick={togglePanel}
      >
        <SpeakerHigh size={19} weight="duotone" aria-hidden="true" />
        <span>Listen</span>
      </Button>
      <section
        id="read-aloud-panel"
        className="read-aloud-player"
        aria-labelledby="read-aloud-heading"
        hidden={!open}
      >
        <div className="read-aloud-heading">
          <div className="read-aloud-title">
            <span className="read-aloud-icon" aria-hidden="true">
              <SpeakerHigh size={21} weight="duotone" />
            </span>
            <div>
              <h2 id="read-aloud-heading">Listen to this page</h2>
              <p>Choose a voice and pace that feel comfortable.</p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Close listen to page controls"
            onClick={() => {
              if (mode === "reading") {
                window.speechSynthesis.pause();
                setMode("paused");
                setStatus("Reading paused.");
              }
              setOpen(false);
              triggerRef.current?.focus();
            }}
          >
            <X aria-hidden="true" />
          </Button>
        </div>
        <div className="read-aloud-controls">
          <Button
            size="default"
            onClick={togglePlayback}
            aria-label={
              mode === "reading"
                ? "Pause reading"
                : mode === "paused"
                  ? "Resume reading"
                  : "Listen to this page"
            }
          >
            {mode === "reading" ? (
              <Pause weight="fill" aria-hidden="true" />
            ) : (
              <Play weight="fill" aria-hidden="true" />
            )}
            {mode === "reading" ? "Pause" : mode === "paused" ? "Resume" : "Listen"}
          </Button>
          <Button
            variant="outline"
            size="default"
            onClick={stopReading}
            disabled={mode === "idle" || mode === "done"}
          >
            <Stop weight="fill" aria-hidden="true" />
            Stop
          </Button>
        </div>
        <details className="read-aloud-settings">
          <summary>Voice and speed</summary>
          <div className="read-aloud-options">
            <label htmlFor="read-aloud-voice">English voice</label>
            <select
              id="read-aloud-voice"
              value={voiceKey}
              onChange={(event) => selectVoice(event.target.value)}
              disabled={!voices.length}
            >
              {voices.length ? (
                voices.map((option) => (
                  <option key={option.key} value={option.key}>
                    {option.voice.name} · {option.voice.localService ? "on this device" : "online voice"}
                  </option>
                ))
              ) : (
                <option value="">Device default voice</option>
              )}
            </select>
            <label htmlFor="read-aloud-speed">
              Speaking speed <output>{rate.toFixed(2)}×</output>
            </label>
            <input
              id="read-aloud-speed"
              type="range"
              min="0.8"
              max="1.15"
              step="0.05"
              value={rate}
              onChange={(event) => changeRate(Number(event.target.value))}
            />
            <p className="read-aloud-privacy">
              On-device voices keep the page text on your device. Online voices may
              send text to their provider.
            </p>
          </div>
        </details>
        <p className="read-aloud-status" role="status" aria-live="polite">
          {status}
        </p>
      </section>
    </div>
  );
}
