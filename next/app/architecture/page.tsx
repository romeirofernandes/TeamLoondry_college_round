import type { Metadata } from "next";
import { ArrowLeft, ArrowUpRight } from "@phosphor-icons/react/dist/ssr";
import BrandLogo from "@/components/brand-logo";
import { ThemeToggle } from "@/components/theme-toggle";
import "../docs/docs.css";

export const metadata: Metadata = {
  title: "System architecture · Handsfree",
  description: "A code-grounded view of Handsfree runtime contexts, voice flow, safeguards and technical decisions.",
};

const stack = [
  ["TypeScript + shared.ts", "Defines typed messages, intents and state shared across extension contexts. Runtime validation still handles untrusted or invalid data."],
  ["Manifest V3 service worker", "Coordinates privileged Chrome APIs, tab management, permissions, session state, storage and action routing."],
  ["Offscreen document", "Runs long-lived speech, recording, camera tracking and feedback separately from the popup, which may close at any time."],
  ["Content runtime + DOM", "Interacts directly with webpage elements, rechecks visibility and validity, and rejects unsafe or ambiguous targets."],
  ["React popup + Next.js dashboard", "Provides reusable session, setup and configuration interfaces. The dashboard stays outside the privileged extension path."],
  ["Web Speech API + MediaRecorder / Groq", "Uses browser speech as the low-friction default, with optional cloud transcription fallback and explicit privacy/API trade-offs."],
  ["MediaPipe local tracking", "Processes face and hand landmarks locally for pointer and gesture input. The trade-offs are model size and device performance."],
  ["Jev / OpenRouter", "Adds broader natural-language interpretation when useful. Latency, cost and data sharing remain bounded by safety checks."],
  ["chrome.storage + Chrome APIs", "Persists settings, calibration, logs and routines while providing browser capabilities under permission and sender validation."],
];

function ArchitectureDiagram() {
  return <figure className="mt-10 overflow-x-auto rounded-3xl border border-border bg-white p-3 shadow-sm dark:bg-[#f6f7f2]">
    <img
      src="/image.png"
      width={1506}
      height={494}
      alt="Handsfree component architecture: user input connects to the popup and offscreen runtime; the MV3 service worker coordinates Chrome APIs, storage, providers, content runtime and the webpage overlay."
      className="block h-auto min-w-[820px] w-full rounded-2xl"
    />
    <figcaption className="px-3 pb-2 pt-4 text-sm leading-6 text-slate-600">Runtime map: solid arrows are extension/page communication paths; dotted arrows identify optional provider paths. Source-verified implementation details are documented below.</figcaption>
  </figure>;
}

export default function ArchitecturePage() {
  return <main className="min-h-screen bg-background text-foreground">
    <a className="skip-link" href="#architecture-main">Skip to architecture</a>
    <header className="docs-header">
      <BrandLogo href="/" />
      <div className="docs-header-actions">
        <a href="/docs">Docs <ArrowUpRight aria-hidden="true" /></a>
        <a href="/benchmark">Benchmark <ArrowUpRight aria-hidden="true" /></a>
        <ThemeToggle />
      </div>
    </header>
    <div id="architecture-main" className="page-width py-12 md:py-20">
      <a className="mb-10 inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-foreground" href="/docs">
        <ArrowLeft aria-hidden="true" /> Back to documentation
      </a>
      <section className="max-w-4xl">
        <p className="docs-eyebrow">Code-grounded technical reference</p>

<h1 className="mt-3 whitespace-normal text-[clamp(0.9rem,2.2vw,2.1rem)] leading-tight tracking-[-0.045em] sm:whitespace-nowrap">
  System architecture
</h1>
        {/* <p className="mt-7 max-w-3xl text-lg leading-8 text-muted-foreground">Handsfree is a Chrome Manifest V3 extension for voice, face and broad-hand browser interaction. This page describes what the repository implements—not a proposed future system.</p> */}
      </section>
      <ArchitectureDiagram />

      <section className="mt-16" aria-labelledby="technology-choices">
        <div className="mb-9 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground">The reasoning behind the stack</p>
            <h2 id="technology-choices" className="mt-3 text-3xl font-semibold tracking-tight md:text-4xl">Technology choices &amp; design rationale</h2>
          </div>
          <span className="rounded-full border border-border bg-secondary px-4 py-2 text-xs font-semibold text-muted-foreground">9 decisions · 1 principle</span>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          {stack.map(([name, reason], index) => (
            <article key={name} className="group rounded-2xl border border-border bg-card p-5 transition-colors hover:border-primary hover:bg-secondary">
              <div className="flex items-start gap-4">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-primary text-xs font-bold text-primary-foreground">{String(index + 1).padStart(2, "0")}</span>
                <div>
                  <h3 className="text-base font-bold tracking-tight">{name}</h3>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">{reason}</p>
                </div>
              </div>
            </article>
          ))}
        </div>
        <aside className="mt-8 rounded-3xl bg-foreground p-7 text-background md:p-9">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">Design principle</p>
          <p className="mt-3 max-w-3xl text-lg font-semibold leading-8">Keep privileged browser operations centralized, continuous media tasks isolated, and webpage interactions validated at the content layer.</p>
          <p className="mt-3 max-w-3xl text-sm leading-6 opacity-70">Cloud services and AI interpretation are optional layers, used only when they provide meaningful value.</p>
        </aside>
      </section>

      {false && <>
      <section className="mt-16 border-y border-border py-10" aria-labelledby="architecture-at-a-glance">
        <h2 id="architecture-at-a-glance" className="text-3xl font-semibold tracking-tight">Architecture at a glance</h2>
        <div className="mt-8 grid gap-3 text-sm md:grid-cols-4">
          <div className="rounded-2xl border border-border bg-card p-5"><strong>User input</strong><p className="mt-2 text-muted-foreground">Microphone, camera, popup and dashboard.</p></div>
          <div className="rounded-2xl border border-primary bg-secondary p-5"><strong>Offscreen runtime</strong><p className="mt-2 text-muted-foreground">Speech, recording, tracking and calibration.</p></div>
          <div className="rounded-2xl border border-border bg-card p-5"><strong>Service worker</strong><p className="mt-2 text-muted-foreground">Intent routing, permissions, tabs, storage and providers.</p></div>
          <div className="rounded-2xl border border-border bg-card p-5"><strong>Webpage runtime</strong><p className="mt-2 text-muted-foreground">Target discovery, overlay, guarded DOM actions.</p></div>
        </div>
        <p className="mt-5 text-sm leading-6 text-muted-foreground"><strong className="text-foreground">Verified:</strong> extension messages are typed in <code>extension/src/shared.ts</code>; the worker, offscreen document and content runtime each handle a portion of that protocol.</p>
      </section>

      <div className="mt-16 grid gap-14 lg:grid-cols-[minmax(0,1.35fr)_minmax(260px,.65fr)]">
        <section>
          <h2 className="text-3xl font-semibold tracking-tight">Voice-command lifecycle</h2>
          <ol className="mt-7 space-y-5 border-l border-border pl-7">
            <li><strong>1. Capture &amp; transcript.</strong><p className="mt-1 text-muted-foreground">The offscreen document creates <code>SpeechAdapter</code>. Final text calls <code>heard()</code>; interim text is forwarded as <code>TRANSCRIPT</code>.</p></li>
            <li><strong>2. Route &amp; parse.</strong><p className="mt-1 text-muted-foreground">The service worker receives <code>HEARD</code>, applies immediate session controls, then uses <code>parseIntent()</code>, site adapters and optional provider mapping.</p></li>
            <li><strong>3. Execute safely.</strong><p className="mt-1 text-muted-foreground">Browser actions use Chrome APIs; page actions use <code>PAGE_ACTION</code> in the active content script. Named targets are ranked, visible, current and unambiguous before activation.</p></li>
            <li><strong>4. Explain outcome.</strong><p className="mt-1 text-muted-foreground">The page overlay announces feedback and state is reflected to the popup/dashboard. Failed or uncertain commands do not become automatic clicks.</p></li>
          </ol>
        </section>
        <aside className="rounded-3xl bg-secondary p-7">
          <p className="text-sm font-bold uppercase tracking-wider">Safety boundary</p>
          <p className="mt-4 leading-7 text-muted-foreground">Form submissions require a separate confirmation. Sensitive, hidden, disabled, covered or changed targets are rejected. Provider output is constrained to supported actions and supplied target IDs.</p>
          <a className="mt-6 inline-flex font-semibold underline underline-offset-4" href="/docs#how-it-works">Read the command guide <ArrowUpRight className="ml-2" aria-hidden="true" /></a>
        </aside>
      </div>

      <section className="mt-20" aria-labelledby="technology-stack">
        <h2 id="technology-stack" className="text-3xl font-semibold tracking-tight">Technology stack, with evidence</h2>
        <div className="mt-7 overflow-x-auto rounded-2xl border border-border">
          <table className="w-full min-w-[720px] text-left text-sm"><thead className="bg-secondary"><tr><th className="p-4">Technology</th><th className="p-4">Rationale</th></tr></thead><tbody>{stack.map(([name, reason]) => <tr className="border-t border-border" key={name}><th className="p-4 font-semibold">{name}</th><td className="p-4 text-muted-foreground">{reason}</td></tr>)}</tbody></table>
        </div>
        <p className="mt-5 text-sm leading-6 text-muted-foreground"><strong className="text-foreground">Technical rationale:</strong> TypeScript suits this browser-native, event-driven system because the same intent/message contracts cross isolated extension contexts. It does not itself guarantee recognition accuracy or webpage compatibility; runtime validation remains necessary.</p>
      </section>

      <section className="mt-20 grid gap-8 md:grid-cols-2">
        <div className="rounded-3xl border border-border bg-card p-7"><h2 className="text-2xl font-semibold">Privacy &amp; permissions</h2><p className="mt-4 leading-7 text-muted-foreground">Camera frames are processed locally by the tracking path. Chrome speech may use Chrome’s provider; browser-mode fallback can send completed recordings to Groq. Optional broad host and tab access are requested separately. Provider keys remain in extension storage/configuration and are not returned to webpages.</p></div>
        <div className="rounded-3xl border border-border bg-card p-7"><h2 className="text-2xl font-semibold">Reliability context</h2><p className="mt-4 leading-7 text-muted-foreground">Preliminary supplied trials total 172 seconds Handsfree versus 140 manual (22.9% slower), with difficult product/song names and an incorrect YouTube selection reported. These are one-trial observations, not a statistically significant performance claim.</p></div>
      </section>
      <footer className="mt-20 border-t border-border py-8 text-sm text-muted-foreground">Full source references, editable Mermaid diagrams, decision records and caveats: <code>docs/HANDSFREE_ARCHITECTURE_AND_TECHNOLOGY_DECISIONS.md</code>.</footer>
      </>}
    </div>
  </main>;
}
