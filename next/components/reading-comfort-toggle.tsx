"use client";

import { useEffect, useState } from "react";
import { TextAa } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";

const STORAGE_KEY = "handsfree-reading-comfort";

export function ReadingComfortToggle() {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    let saved = false;
    try {
      saved = window.localStorage.getItem(STORAGE_KEY) === "on";
    } catch {
      // Keep the preference available for this session if storage is blocked.
    }
    setEnabled(saved);
    document.documentElement.classList.toggle("reading-comfort", saved);
  }, []);

  function toggleComfort() {
    const next = !enabled;
    setEnabled(next);
    document.documentElement.classList.toggle("reading-comfort", next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next ? "on" : "off");
    } catch {
      // The visual setting still works for this session if storage is blocked.
    }
  }

  return (
    <Button
      className="reading-comfort-toggle"
      variant="outline"
      size="default"
      aria-pressed={enabled}
      aria-label={`${enabled ? "Turn off" : "Turn on"} reading comfort`}
      title="Reading comfort"
      onClick={toggleComfort}
    >
      <TextAa size={19} aria-hidden="true" />
      <span className="reading-comfort-label">Reading comfort</span>
    </Button>
  );
}
