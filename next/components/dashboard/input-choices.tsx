"use client";

import { Hand, Microphone, UserFocus } from "@phosphor-icons/react";
import { FieldSet, FieldLegend } from "@/components/ui/field";
import {
  inputMethods,
  type InputMethod,
  type Settings,
} from "../../../extension/src/shared";

export const inputLabels: Record<InputMethod, string> = {
  voice: "Voice",
  face: "Head movement",
  hand: "Hand movement",
};
const choices = [
  {
    id: "voice" as const,
    icon: Microphone,
    hint: "Speak commands and dictate text. No camera needed.",
  },
  {
    id: "face" as const,
    icon: UserFocus,
    hint: "Move the pointer with small, comfortable head movements.",
  },
  {
    id: "hand" as const,
    icon: Hand,
    hint: "Move the pointer with an open palm, at your own pace.",
  },
];

export function InputChoices({
  selected,
  onChange,
  disabled = false,
}: {
  selected: InputMethod[];
  onChange: (inputs: InputMethod[]) => void;
  disabled?: boolean;
}) {
  return (
    <FieldSet disabled={disabled} className="input-choice-group">
      <FieldLegend>Choose any combination</FieldLegend>
      <div className="input-choices">
        {choices.map(({ id, icon: Icon, hint }, index) => (
          <label
            key={id}
            className="input-choice"
            data-selected={selected.includes(id)}
          >
            <input
              type="checkbox"
              aria-label={inputLabels[id]}
              aria-describedby={`input-hint-${id}`}
              checked={selected.includes(id)}
              onChange={(event) =>
                onChange(
                  event.target.checked
                    ? [...selected, id]
                    : selected.filter((input) => input !== id),
                )
              }
            />
            <Icon aria-hidden="true" />
            <span>
              <span className="input-choice-title">
                <span aria-hidden="true">{index + 1}. </span>
                {inputLabels[id]}
              </span>
              <span className="input-choice-hint" id={`input-hint-${id}`}>
                {hint}
              </span>
            </span>
          </label>
        ))}
      </div>
    </FieldSet>
  );
}

export function PrimaryPointer({
  settings,
  onChange,
  disabled = false,
}: {
  settings: Settings;
  onChange: (pointerMode: Settings["pointerMode"]) => void;
  disabled?: boolean;
}) {
  const pointers = inputMethods(settings).filter((input) => input !== "voice");
  if (pointers.length < 2) return null;
  return (
    <FieldSet disabled={disabled} className="primary-pointer">
      <FieldLegend>Which pointer would you like to start with?</FieldLegend>
      <p>
        Use one at a time. Switch here or say “use head” or “use hands” when
        voice is on.
      </p>
      <div className="primary-pointer-options">
        {pointers.map((pointer) => (
          <label key={pointer} data-selected={settings.pointerMode === pointer}>
            <input
              type="radio"
              name="primary-pointer"
              checked={settings.pointerMode === pointer}
              onChange={() => onChange(pointer)}
            />
            {inputLabels[pointer]}
          </label>
        ))}
      </div>
    </FieldSet>
  );
}
