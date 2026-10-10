"use client";

import { useTheme } from "next-themes";
import { flushSync } from "react-dom";
import { Moon, Sun } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();

  function toggleTheme() {
    const nextTheme = resolvedTheme === "dark" ? "light" : "dark";
    const root = document.documentElement;
    const direction = nextTheme === "dark" ? "to-dark" : "to-light";
    root.dataset.pitchDirection = direction;

    if (document.startViewTransition) {
      const transition = document.startViewTransition(() => {
        flushSync(() => setTheme(nextTheme));
      });
      void transition.finished.then(
        () => delete root.dataset.pitchDirection,
        () => delete root.dataset.pitchDirection,
      );
      return;
    }

    setTheme(nextTheme);
    window.setTimeout(() => delete root.dataset.pitchDirection, 2400);
  }

  return (
    <Button
      variant="outline"
      size="icon-lg"
      aria-label="Toggle color theme"
      onClick={toggleTheme}
    >
      <Moon className="dark:hidden" aria-hidden="true" />
      <Sun className="hidden dark:block" aria-hidden="true" />
    </Button>
  );
}
