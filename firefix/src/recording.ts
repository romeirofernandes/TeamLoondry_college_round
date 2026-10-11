import { send } from "./shared";

/** Browser speech fallback. Sends completed utterances only, never overlapping requests. */
export class RecordedSpeech {
  private stream: MediaStream | null = null;
  private context: AudioContext | null = null;
  private recorder: MediaRecorder | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private generation = 0;
  constructor(private onText: (text: string) => void, private onStatus: (text: string) => void) {}
  async start(language: string) {
    this.stop();
    const token = ++this.generation;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      if (token !== this.generation) { stream.getTracks().forEach(track => track.stop()); return; }
      this.stream = stream;
      const context = this.context = new AudioContext();
      await context.resume();
      if (token !== this.generation) return;
      const analyser = context.createAnalyser();
      analyser.fftSize = 1024;
      context.createMediaStreamSource(stream).connect(analyser);
      const samples = new Float32Array(analyser.fftSize);
      let uploadQueue = Promise.resolve();
      let queued = 0;
      let chunks: Blob[] = [];
      let began = 0;
      let lastSpeech = 0;
      let voiced = 0;
      const mimeType = ["audio/webm;codecs=opus", "audio/webm"].find(type => MediaRecorder.isTypeSupported(type));
      const begin = () => {
        chunks = []; voiced = 0; began = performance.now(); lastSpeech = began;
        const recorder = this.recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
        recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
        recorder.onstop = () => {
          if (token !== this.generation) return;
          this.recorder = null;
          if (voiced < 100 || !chunks.length) return;
          if (queued >= 2) { this.onStatus("Speech is catching up. Repeat the last command shortly."); return; }
          queued++;
          const blob = new Blob(chunks, { type: recorder.mimeType || "audio/webm" });
          let failed = false;
          uploadQueue = uploadQueue.then(async () => {
            if (token !== this.generation) return null;
            this.onStatus("Transcribing with Groq");
            const buffer = await blob.arrayBuffer();
            if (token !== this.generation) return null;
            return send<{ text: string }>({ type: "TRANSCRIBE_AUDIO", audio: Array.from(new Uint8Array(buffer)), mime: blob.type, language });
          })
            .then(result => { if (token === this.generation && result?.text.trim()) this.onText(result.text.trim()); })
            .catch(error => { failed = true; if (token === this.generation) this.onStatus(error instanceof Error ? error.message : "Transcription failed. Check your connection and retry."); })
            .finally(() => { queued--; if (token === this.generation && !failed && !queued) this.onStatus("Listening with Groq"); });
        };
        recorder.start(200);
      };
      this.onStatus("Listening with Groq");
      // Record silence locally ahead of the next utterance, retaining its first
      // syllable. Silent recordings are discarded and never uploaded.
      begin();
      this.timer = setInterval(() => {
        if (token !== this.generation) return;
        if (!this.recorder) begin();
        analyser.getFloatTimeDomainData(samples);
        const energy = Math.sqrt(samples.reduce((sum, value) => sum + value * value, 0) / samples.length);
        const now = performance.now();
        if (energy > 0.012) {
          lastSpeech = now;
          voiced += 50;
        }
        if (this.recorder?.state === "recording" && ((voiced > 0 && now - lastSpeech > 650) || now - began > 8000)) this.recorder.stop();
      }, 50);
    } catch (error) {
      if (token !== this.generation) return;
      this.stop();
      throw error;
    }
  }
  stop() {
    ++this.generation;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    if (this.recorder?.state === "recording") this.recorder.stop();
    this.recorder = null;
    this.stream?.getTracks().forEach(track => track.stop());
    this.stream = null;
    void this.context?.close().catch(() => {});
    this.context = null;
  }
}
