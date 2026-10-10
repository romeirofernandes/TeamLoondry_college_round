import type { Settings } from "./shared";

interface SpeechResult {
  isFinal: boolean;
  [index: number]: { transcript: string };
}
interface SpeechEvent {
  resultIndex: number;
  results: ArrayLike<SpeechResult>;
}
interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  processLocally?: boolean;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onresult: ((event: SpeechEvent) => void) | null;
  onerror: ((event: { error: string; message?: string }) => void) | null;
  start(): void;
  abort(): void;
}
interface RecognitionConstructor {
  new (): Recognition;
  available?: (options: {
    langs: string[];
    processLocally: boolean;
  }) => Promise<string>;
  install?: (options: {
    langs: string[];
    processLocally: boolean;
  }) => Promise<boolean>;
}
function recognizerClass(): RecognitionConstructor {
  const global = globalThis as unknown as {
    SpeechRecognition?: RecognitionConstructor;
    webkitSpeechRecognition?: RecognitionConstructor;
  };
  const constructor =
    global.SpeechRecognition ?? global.webkitSpeechRecognition;
  if (!constructor)
    throw new Error(
      "Speech recognition is unavailable. Use current Google Chrome with microphone access.",
    );
  return constructor;
}
/** Download is deliberately separate from start and must be called by a user action. */
export async function installLocalSpeech(language: string): Promise<void> {
  const Recognition = recognizerClass();
  if (!Recognition.available || !Recognition.install)
    throw new Error(
      "This Chrome build cannot install local speech. Update Chrome, or choose browser speech after reading its audio notice.",
    );
  const state = await Recognition.available({
    langs: [language],
    processLocally: true,
  });
  if (state === "available") return;
  if (state === "unavailable")
    throw new Error(
      `No local speech language pack is available for ${language}.`,
    );
  if (!(await Recognition.install({ langs: [language], processLocally: true })))
    throw new Error(
      "Language pack download failed. Check your connection and retry.",
    );
}

const errorHelp: Record<string, string> = {
  "not-allowed":
    "Microphone denied. Allow microphone access in Chrome, then start again.",
  "service-not-allowed":
    "Speech is blocked by Chrome policy. Check browser permissions or use another Chrome profile.",
  "audio-capture": "No microphone is available. Connect one and start again.",
  "language-not-supported":
    "The selected speech language is unavailable. Install its local language pack or choose a supported language.",
  network:
    "Speech service could not connect. Check your connection. Local speech can avoid remote speech service.",
  "no-speech": "No speech detected. Move nearer the microphone and try again.",
  aborted: "Speech recognition was interrupted. Start again.",
};

export class SpeechAdapter {
  private settings: Settings | null = null;
  private recognition: Recognition | null = null;
  private generation = 0;
  private active = false;
  private retryCount = 0;
  private restartTimer: ReturnType<typeof setTimeout> | null = null;
  private startupTimer: ReturnType<typeof setTimeout> | null = null;
  private rejectStartup: ((error: Error) => void) | null = null;
  constructor(
    private onText: (text: string) => void,
    private onStatus: (status: string) => void,
  ) {}
  async start(settings: Settings): Promise<void> {
    this.stop();
    this.settings = { ...settings };
    const token = ++this.generation;
    this.active = true;
    this.retryCount = 0;
    try {
      const Recognition = recognizerClass();
      const recognition = new Recognition();
      if (settings.speechMode === "local") {
        this.onStatus("Checking on-device speech");
        if (!Recognition.available || !("processLocally" in recognition))
          throw new Error(
            "Local speech is not supported by this Chrome build. Update Chrome, or explicitly choose browser speech after reading its audio notice.",
          );
        const state = await Recognition.available({
          langs: [settings.language],
          processLocally: true,
        });
        if (token !== this.generation) return;
        if (state !== "available")
          throw new Error(
            state === "unavailable"
              ? `No local speech language pack is available for ${settings.language}. Choose a supported language or browser speech.`
              : "Local speech language pack is not installed. Use Install local speech, then start again.",
          );
        recognition.processLocally = true;
      } else recognition.processLocally = false;
      if (token !== this.generation) return;
      await this.open(recognition, token);
    } catch (error) {
      if (token !== this.generation) return;
      this.stop();
      this.onStatus(error instanceof Error ? error.message : String(error));
      throw error;
    }
  }
  private open(recognition: Recognition, token: number): Promise<void> {
    const settings = this.settings!;
    recognition.lang = settings.language;
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    this.recognition = recognition;
    const current = () =>
      this.active &&
      token === this.generation &&
      this.recognition === recognition;
    return new Promise((resolve, reject) => {
      let settled = false;
      let lastError = "";
      const success = () => {
        if (settled) return;
        settled = true;
        this.clearStartup();
        resolve();
      };
      const fail = (error: Error) => {
        if (settled) return;
        settled = true;
        this.clearStartup();
        reject(error);
      };
      this.rejectStartup = fail;
      this.startupTimer = setTimeout(() => {
        if (current()) {
          fail(
            new Error(
              "Speech did not start. Allow microphone access, then retry.",
            ),
          );
          this.disable();
        }
      }, 10000);
      recognition.onstart = () => {
        if (!current()) return;
        this.onStatus(
          settings.speechMode === "local"
            ? "Listening on device"
            : "Listening with browser speech",
        );
        success();
      };
      recognition.onresult = (event) => {
        if (!current()) return;
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i];
          if (!result.isFinal) continue;
          const text = result[0]?.transcript?.trim();
          if (text) {
            this.retryCount = 0;
            this.onText(text);
          }
        }
      };
      recognition.onerror = (event) => {
        if (!current()) return;
        lastError = event.error;
        const help =
          errorHelp[event.error] ??
          `Speech error: ${event.error}. Stop and start again.`;
        this.onStatus(help);
        if (
          [
            "not-allowed",
            "service-not-allowed",
            "audio-capture",
            "language-not-supported",
            "aborted",
          ].includes(event.error)
        ) {
          fail(new Error(help));
          this.disable();
        }
      };
      recognition.onend = () => {
        if (!current()) return;
        if (!settled) {
          fail(
            new Error(
              errorHelp[lastError] ??
                "Speech ended before it started. Check microphone permissions, then retry.",
            ),
          );
          this.disable();
          return;
        }
        this.recognition = null;
        if (++this.retryCount > 4) {
          this.onStatus(
            "Speech stopped after repeated interruptions. Check the microphone and network, then start again.",
          );
          this.disable();
          return;
        }
        this.restartTimer = setTimeout(
          () => {
            this.restartTimer = null;
            if (!this.active || token !== this.generation) return;
            let next: Recognition;
            try {
              next = new (recognizerClass())();
              next.processLocally = settings.speechMode === "local";
            } catch (error) {
              this.onStatus(String(error));
              this.disable();
              return;
            }
            void this.open(next, token).catch((error) => {
              if (token === this.generation) {
                this.onStatus(error.message);
                this.disable();
              }
            });
          },
          Math.min(3000, 250 * this.retryCount),
        );
      };
      try {
        recognition.start();
      } catch (error) {
        fail(error instanceof Error ? error : new Error(String(error)));
        this.disable();
      }
    });
  }
  private clearStartup() {
    if (this.startupTimer) clearTimeout(this.startupTimer);
    this.startupTimer = null;
    this.rejectStartup = null;
  }
  private disable() {
    this.active = false;
    if (this.restartTimer) clearTimeout(this.restartTimer);
    this.restartTimer = null;
    this.rejectStartup?.(new Error("Speech stopped"));
    this.clearStartup();
    const recognition = this.recognition;
    this.recognition = null;
    if (recognition) {
      recognition.onstart = null;
      recognition.onend = null;
      recognition.onresult = null;
      recognition.onerror = null;
      try {
        recognition.abort();
      } catch {}
    }
  }
  pause() {
    ++this.generation;
    this.disable();
    this.onStatus("Paused");
  }
  stop() {
    ++this.generation;
    this.disable();
    this.onStatus("Off");
  }
  async resume(): Promise<void> {
    if (!this.settings) throw new Error("Start speech before resuming.");
    await this.start(this.settings);
  }
}
