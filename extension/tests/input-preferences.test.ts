import { describe, expect, it } from "vitest";
import { defaults, inputMethods, normalizeControlSettings, voiceEnabled, type InputMethod } from "../src/shared";

describe("independent input preferences", () => {
  it.each([
    ["voice"], ["face"], ["hand"], ["voice", "face"],
    ["voice", "hand"], ["face", "hand"], ["voice", "face", "hand"],
  ] as InputMethod[][])("keeps the selected inputs %j", (...enabledInputs) => {
    const settings = normalizeControlSettings({ enabledInputs });
    expect(inputMethods(settings)).toEqual(enabledInputs);
    expect(voiceEnabled(settings)).toBe(enabledInputs.includes("voice"));
    expect(settings.voiceOnly).toBe(!enabledInputs.some(input => input !== "voice"));
    if (!settings.voiceOnly) expect(enabledInputs).toContain(settings.pointerMode);
  });
  it("migrates legacy voice-only and hand preferences without losing pointer tuning", () => {
    expect(normalizeControlSettings({ voiceOnly: true, sensitivity: 2 })).toMatchObject({ enabledInputs: ["voice"], sensitivity: 2 });
    expect(normalizeControlSettings({ pointerMode: "hand", dwellEnabled: false })).toMatchObject({ enabledInputs: ["voice", "hand"], pointerMode: "hand", dwellEnabled: false });
  });
  it("keeps pointer preferences while switching to voice and back", () => {
    const voice = normalizeControlSettings({ ...defaults, enabledInputs: ["voice"], dwellEnabled: true, edgeScroll: true });
    const both = normalizeControlSettings({ ...voice, enabledInputs: ["voice", "face", "hand"], pointerMode: "hand" });
    expect(both).toMatchObject({ pointerMode: "hand", dwellEnabled: true, edgeScroll: true });
  });
  it("bounds invalid selections and onboarding progress", () => {
    expect(normalizeControlSettings({ enabledInputs: [], onboardingStep: 99 })).toMatchObject({ enabledInputs: ["voice"], onboardingStep: 2 });
  });
});
