"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { request, subscribeVoice } from "@/lib/extension-bridge";

/** Setup commands stay in the trusted dashboard, never in the browsing tab. */
export function useScreenGuidance(
  connected: boolean,
  onHeard: (text: string) => void,
) {
  const handler = useRef(onHeard);
  handler.current = onHeard;
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [guidanceNotice, setGuidanceNotice] = useState("");
  const narration = useRef(0);
  const stopReading = useCallback(() => {
    ++narration.current;
    setSpeaking(false);
    if (typeof speechSynthesis !== "undefined") speechSynthesis.cancel();
    if (connected) void request({ type: "UI_SPEAK", text: "" }).catch(() => {});
  }, [connected]);
  const read = useCallback(
    async (text: string) => {
      const token = ++narration.current;
      setSpeaking(true);
      setGuidanceNotice("");
      try {
        if (connected) await request({ type: "UI_SPEAK", text });
        else {
          if (typeof speechSynthesis === "undefined")
            throw new Error(
              "Spoken guidance is unavailable. Your screen reader and keyboard can still navigate setup.",
            );
          speechSynthesis.cancel();
          await new Promise<void>((resolve, reject) => {
            const utterance = new SpeechSynthesisUtterance(text);
            utterance.lang = "en-US";
            utterance.onend = () => resolve();
            utterance.onerror = () =>
              reject(
                new Error(
                  "Choose Read setup aloud to start speech, or use your screen reader.",
                ),
              );
            speechSynthesis.speak(utterance);
          });
        }
      } catch (error) {
        if (token === narration.current)
          setGuidanceNotice(
            error instanceof Error
              ? error.message
              : "Choose Read aloud to retry.",
          );
      } finally {
        if (token === narration.current) setSpeaking(false);
      }
    },
    [connected],
  );
  useEffect(
    () =>
      subscribeVoice((text) => {
        setGuidanceNotice(`Heard: ${text}`);
        handler.current(text);
      }),
    [],
  );
  useEffect(() => {
    if (!connected || !listening) return;
    let disposed = false;
    let renewing = false;
    const renew = () => {
      if (renewing || disposed) return;
      if (document.visibilityState !== "visible" || !document.hasFocus()) {
        void request({ type: "UI_VOICE", enabled: false }).catch(() => {});
        return;
      }
      renewing = true;
      void request({ type: "UI_VOICE", enabled: true })
        .catch((error) => {
          if (!disposed) {
            setGuidanceNotice(error.message);
            setListening(false);
          }
        })
        .finally(() => {
          renewing = false;
        });
    };
    const suspend = () => {
      stopReading();
      void request({ type: "UI_VOICE", enabled: false }).catch(() => {});
    };
    renew();
    const timer = setInterval(renew, 5000);
    addEventListener("focus", renew);
    addEventListener("blur", suspend);
    document.addEventListener("visibilitychange", renew);
    return () => {
      disposed = true;
      clearInterval(timer);
      removeEventListener("focus", renew);
      removeEventListener("blur", suspend);
      document.removeEventListener("visibilitychange", renew);
      void request({ type: "UI_VOICE", enabled: false }).catch(() => {});
    };
  }, [connected, listening, stopReading]);
  useEffect(
    () => () => {
      ++narration.current;
      if (typeof speechSynthesis !== "undefined") speechSynthesis.cancel();
      if (connected)
        void request({ type: "UI_SPEAK", text: "" }).catch(() => {});
    },
    [connected],
  );
  return {
    listening,
    setListening,
    speaking,
    read,
    stopReading,
    guidanceNotice,
    setGuidanceNotice,
  };
}
