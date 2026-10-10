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
      let busy = false;
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
          if (voiced < 150 || !chunks.length) return;
          busy = true;
          this.onStatus("Transcribing with Groq");
          const blob = new Blob(chunks, { type: recorder.mimeType || "audio/webm" });
          let failed = false;
          void blob.arrayBuffer().then(buffer => {
            if (token !== this.generation) return null;
            return send<{ text: string }>({ type: "TRANSCRIBE_AUDIO", audio: Array.from(new Uint8Array(buffer)), mime: blob.type, language });
          })
            .then(result => { if (token === this.generation && result?.text.trim()) this.onText(result.text.trim()); })
            .catch(error => { failed = true; if (token === this.generation) this.onStatus(error instanceof Error ? error.message : "Transcription failed. Check your connection and retry."); })
            .finally(() => { busy = false; if (token === this.generation && !failed) this.onStatus("Listening with Groq"); });
        };
        recorder.start(200);
      };
      this.onStatus("Listening with Groq");
      this.timer = setInterval(() => {
        if (token !== this.generation || busy) return;
        analyser.getFloatTimeDomainData(samples);
        const energy = Math.sqrt(samples.reduce((sum, value) => sum + value * value, 0) / samples.length);
        const now = performance.now();
        if (energy > 0.012) {
          if (!this.recorder) begin();
          lastSpeech = now;
          voiced += 50;
        }
        if (this.recorder?.state === "recording" && (now - lastSpeech > 650 || now - began > 8000)) this.recorder.stop();
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
