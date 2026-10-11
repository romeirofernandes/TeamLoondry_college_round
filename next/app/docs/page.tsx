import { ModeGuide } from "./mode-guide";
import type { Metadata } from "next";
import { ArrowUpRight } from "@phosphor-icons/react/dist/ssr";
import BrandLogo from "@/components/brand-logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { catalogue } from "../../../extension/src/sites/catalogue";
import { siteGuides } from "./site-guide";
import type { SiteId } from "../../../extension/src/sites/types";
import "./docs.css";

export const metadata: Metadata = {
  title: "Docs · Handsfree",
  description:
    "Learn Handsfree setup, voice commands, supported websites, site adapters, Jev and the LLM layer.",
};

const topics = [
  ["getting-started", "Get started"],
  ["commands", "Voice commands"],
  ["activity-modes", "Task modes and highlighting"],
  ["websites", "Supported websites"],
  ["how-it-works", "How commands work"],
  ["architecture", "Architecture"],
  ["site-adapters", "Site adapters"],
];
const commandGroups = [
  {
    name: "Browse and select",
    commands: [
      ["Scroll down", "Scroll the page or active container."],
      ["Scroll to the bottom", "Reach the end of the page or container."],
      ["Go back", "Return to the previous page."],
      ["Open Careers", "Find a visible label and activate its control."],
      ["Click", "Click at the cursor position."],
      ["Choose two", "Choose from the most recently announced matches."],
    ],
  },
  {
    name: "Move between pages",
    commands: [
      ["New tab", "Open Chrome's New Tab page. Say search for, followed by your query."],
      ["Next tab", "Move to the next tab."],
      ["Previous tab", "Move to the previous tab."],
      ["Go to Wikipedia", "Switch to a matching title."],
      ["Close tab", "Close the current tab immediately."],
      ["Open a new tab with phones under 30k", "Open search results for phones under 30k."],
      ["Search for jazz", "Search in a new tab."],
      ["Background search for jazz", "Search without switching tabs."],
      ["Open downloads", "Open Chrome downloads."],
    ],
  },
  {
    name: "Media",
    commands: [
      ["Play video / pause video", "Control the available player."],
      ["Forward ten seconds / rewind five seconds", "Seek within media."],
    ],
  },
  {
    name: "Dictation and forms",
    commands: [
      ["Start typing", "Dictate into the selected field."],
      ["Stop typing", "Finish dictation and return to commands."],
      ["Scratch that", "Remove the last Handsfree dictation segment."],
      ["Put that back", "Restore the segment you removed."],
      ["Submit form", "Review a submission request, then say confirm."],
      ["Cancel", "Cancel a pending action."],
    ],
  },
  {
    name: "Session and questions",
    commands: [
      ["Pause handsfree", "Pause pointing, actions and dictation."],
      ["Resume handsfree", "Resume your paused session."],
      [
        "Stop handsfree",
        "End the session and release camera and microphone capture.",
      ],
      ["Hey handsfree, summarize this page", "Ask the LLM for a page summary."],
      ["Hey handsfree, what is a browser?", "Ask a general question."],
    ],
  },
];
const sourceFiles = [
  ["registry.ts", "Registers the fifteen website adapters."],
  [
    "catalogue.ts",
    "Defines action IDs, example phrases and descriptions. An entry alone does not mean an action is available.",
  ],
  [
    "context.ts",
    "Detects the website and builds a snapshot of its current page, entities and capabilities.",
  ],
  [
    "language.ts",
    "Maps recognized website phrases to supported action requests.",
  ],
  ["resolver.ts", "Finds visible controls, fields and labels on the page."],
  ["executor.ts", "Runs adapter operations and checks their results."],
  [
    "group-b.ts",
    "Handles messaging, meetings, jobs, trains and maps, including their confirmation rules.",
  ],
  [
    "types.ts",
    "Defines page snapshots, requests, results and availability states.",
  ],
];

export default function DocsPage() {
  return (
    <div className="handsfree-docs">
      <a className="skip-link" href="#docs-main">
        Skip to documentation
      </a>
      <header className="docs-header">
        <BrandLogo href="/" />
        <div className="docs-header-actions">
          <a href="/benchmark">
            Benchmark report <ArrowUpRight aria-hidden="true" />
          </a>
          <a href="/dashboard">
            Open Handsfree <ArrowUpRight aria-hidden="true" />
          </a>
          <ThemeToggle />
        </div>
      </header>
      <div className="docs-layout">
        <nav className="docs-nav" aria-label="Documentation topics">
          <p>Documentation</p>
          {topics.map(([id, label]) => (
            <a key={id} href={`#${id}`}>
              {label}
            </a>
          ))}
        </nav>
        <main id="docs-main" className="docs-main">
          <div className="docs-intro">
            <p className="docs-eyebrow">Handsfree docs</p>
            <h1>Browse your way.</h1>
            <p>
              Set up your controls, learn a few commands, and see what works on
              each website.
            </p>
          </div>
          <section id="getting-started" className="docs-section">
            <h2>Get started</h2>
            <ol className="docs-steps">
              <li>
                <h3>Install the extension</h3>
                <p>
                  <a href="/downloads">Download Handsfree</a> and follow the
                  Chrome or Firefox installation steps, then open the dashboard.
                </p>
              </li>
              <li>
                <h3>Choose your controls</h3>
                <p>
                  Use voice, head movement, hand movement, or a combination. If
                  you choose both head and hands, select one as your primary
                  pointer.
                </p>
              </li>
              <li>
                <h3>Allow the access you need</h3>
                <p>
                  Head and hands need the camera. Voice needs the microphone.
                  Manage browser and device access in Profile → Permissions.
                </p>
              </li>
              <li>
                <h3>Start your session</h3>
                <p>
                  Open a website and start Handsfree. Calibrate your pointer
                  with five comfortable poses. Switch pointers deliberately;
                  each keeps its own calibration.
                </p>
              </li>
            </ol>
            <p className="docs-note">
              Setup offers spoken help after five seconds and repeats once if
              you do not respond. A voice reply continues spoken guidance when
              microphone access is allowed. Using a setup button or setting
              keeps future setup silent on this device.
            </p>
          </section>
          <section id="commands" className="docs-section">
            <h2>Voice commands</h2>
            <p>
              Start with the exact phrases below. Direct browser commands run
              locally. Jev can interpret supported paraphrases when configured.
            </p>
            <div className="docs-disclosures">
              {commandGroups.map((group) => (
                <details key={group.name}>
                  <summary>{group.name}</summary>
                  <dl className="docs-command-list">
                    {group.commands.map(([command, meaning]) => (
                      <div key={command}>
                        <dt>{command}</dt>
                        <dd>{meaning}</dd>
                      </div>
                    ))}
                  </dl>
                </details>
              ))}
            </div>
            <p className="docs-note">
              During dictation, ordinary speech becomes text. Say “stop typing”
              to finish. Your saved pause and resume phrases and “stop
              handsfree” still control the session. Writing recognition and
              cleanup follow your configured speech service and the Rambler cloud-processing rules below.
            </p>
            <p>
              Every general question or arbitrary request needs “hey handsfree”
              at the start of the same utterance. Saying it alone does not
              enable later requests.
            </p>
          </section>
          <ModeGuide />
          <section id="websites" className="docs-section">
            <div className="docs-section-title">
              <h2>Supported websites</h2>
              <span>15 adapters</span>
            </div>
            <p>
              Open a website below to use its dedicated commands. Each adapter
              checks the current page and visible controls. Signed-in pages
              require your own session.
            </p>
            <div className="docs-site-list">
              {(
                Object.entries(siteGuides) as [
                  SiteId,
                  (typeof siteGuides)[SiteId],
                ][]
              ).map(([id, site]) => (
                <details key={id} id={`site-${id}`}>
                  <summary>
                    <span>{site.name}</span>
                    <span className="docs-site-summary">{site.summary}</span>
                  </summary>
                  <div className="docs-site-content">
                    <h3>Try saying</h3>
                    <ul>
                      {catalogue
                        .filter((action) => action.site === id)
                        .slice(0, 3)
                        .map((action) => (
                          <li key={action.id}>{action.examples[0]}</li>
                        ))}
                    </ul>
                    <h3>Current limits</h3>
                    <p>{site.limits}</p>
                    <code className="docs-file">
                      extension/src/sites/{id}.ts
                    </code>
                  </div>
                </details>
              ))}
            </div>
            <p className="docs-note">
              On other websites, generic scrolling, tab controls, visible-label
              selection and dictation remain available where Chrome permits
              them. Website layouts can change; automated fixture coverage does
              not guarantee every live account workflow.
            </p>
          </section>
          <section id="how-it-works" className="docs-section">
            <h2>How commands work</h2>
            <p>
              Handsfree checks direct commands and website actions before asking
              a provider. The command must still match the current page and
              session.
            </p>
            <ol className="docs-layers">
              <li>
                <span aria-hidden="true">01</span>
                <div>
                  <h3>Local commands</h3>
                  <p>
                    Exact browser commands and recognized site phrases use the
                    parser and adapters directly. No AI key is needed for these
                    commands. A visible target is matched locally before it is
                    activated.
                  </p>
                </div>
              </li>
              <li>
                <span aria-hidden="true">02</span>
                <div>
                  <h3>The Jev layer</h3>
                  <p>
                    Jev interprets ordinary phrasing and chooses from supported
                    browser or website actions. It can use tab titles and
                    visible control labels to understand a request. It cannot
                    invent a new action. The extension validates its choice
                    before execution.
                  </p>
                  <p>
                    Jev uses the configured OpenRouter or TypeSafe provider.
                    Unrecognized ordinary speech stops here; it does not
                    automatically become an arbitrary LLM request.
                  </p>
                </div>
              </li>
              <li>
                <span aria-hidden="true">03</span>
                <div>
                  <h3>The LLM layer</h3>
                  <p>
                    A request beginning with “hey handsfree” can use Groq for a
                    question, a page summary or a supported page action. Direct
                    commands can still resolve locally. Groq receives the phrase
                    and permitted page context, and its response is checked
                    against supported actions and real targets.
                  </p>
                  <p>
                    Answers appear as text. Finding highlights matches;
                    explicitly asking to click or open can activate a target.
                    Existing confirmation rules still apply.
                  </p>
                </div>
              </li>
            </ol>
            <details className="docs-privacy">
              <summary>What stays local and what can be shared</summary>
              <p>
                Camera frames and pointer tracking stay on your device. Writing
                uses your selected recognition service and bounded Groq cleanup. Jev receives command
                context such as language, tab titles and visible labels. Groq
                page requests can include the page title, URL and public page
                text; passwords, editable fields and Handsfree controls are
                excluded. Chrome speech may use online processing, and its
                fallback can send microphone recordings to Groq. Choose
                on-device speech in Profile → Controls → Speech & language to
                keep recognition local.
              </p>
            </details>
          </section>
          <section id="architecture" className="docs-section">
            <h2>System architecture</h2>
            <p>
              Handsfree separates long-lived device capture, privileged browser
              operations and webpage DOM interaction into Chrome extension
              contexts. The service worker coordinates their typed messages;
              the webpage runtime remains responsible for what it can safely
              see and activate.
            </p>
            <p>
              The technical reference documents the actual command lifecycle,
              permissions, provider boundaries, trade-offs, tests and
              preliminary benchmark context. It distinguishes source-verified
              facts from engineering rationale and open questions.
            </p>
            <a className="docs-footer-link" href="/architecture">
              Open system architecture &amp; technology decisions
              <ArrowUpRight aria-hidden="true" />
            </a>
          </section>
          <section id="site-adapters" className="docs-section">
            <h2>Inside the site adapters</h2>
            <p>
              The website-specific code lives in{" "}
              <code>extension/src/sites</code>. Each website file describes what
              that site exposes, which commands it recognizes, and how an action
              must be checked.
            </p>
            <p>
              The shared flow is: detect the site, inspect the page, resolve the
              command, run a supported operation, then verify the outcome.
              Missing controls ask for a choice or report that the action is
              unavailable.
            </p>
            <div className="docs-source-table">
              <table>
                <caption>Shared files in extension/src/sites</caption>
                <thead>
                  <tr>
                    <th scope="col">File</th>
                    <th scope="col">Purpose</th>
                  </tr>
                </thead>
                <tbody>
                  {sourceFiles.map(([file, purpose]) => (
                    <tr key={file}>
                      <th scope="row">
                        <code>{file}</code>
                      </th>
                      <td>{purpose}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p>
              Provider interpretation lives in{" "}
              <code>extension/src/providers.ts</code>. Session handling and
              routing live in <code>extension/src/background.ts</code>. A site
              adapter does not call the LLM directly or bypass submission and
              account-action checks.
            </p>
          </section>
          <footer className="docs-footer">
            <a href="/dashboard">
              Return to Handsfree <ArrowUpRight aria-hidden="true" />
            </a>
            <span>Handsfree by Team Loondry</span>
          </footer>
        </main>
      </div>
    </div>
  );
}
