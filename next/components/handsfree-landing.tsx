import Image from "next/image";
import {
  ArrowRight,
  ArrowUpRight,
  HandWaving,
  HeadCircuit,
  Microphone,
  ShieldCheck,
  SlidersHorizontal,
  Webcam,
} from "@phosphor-icons/react/ssr";
import BrandLogo from "@/components/brand-logo";
import { SiteHeader } from "@/components/site-header";
import { Button } from "@/components/ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

const modes = [
  {
    name: "Face movements",
    icon: HeadCircuit,
    action: "Your head leads the way.",
    description:
      "Guide an in-page cursor with head movements. Smoothing filters small shakes, while slow posture adaptation keeps your neutral position comfortable.",
    capability: "Primary pointer · adjustable sensitivity",
  },
  {
    name: "Hand gestures",
    icon: HandWaving,
    action: "Broad movements. Clear intentions.",
    description:
      "Use broad hand movements as a second pointer, then hold to confirm. No pinch or precise finger control required.",
    capability: "Point + hold · no pinch required",
  },
  {
    name: "Voice",
    icon: Microphone,
    action: "Say where you want to go.",
    description:
      "Say “scroll down,” “click this,” or “next tab.” Start typing to dictate into a field; dictation stays separate from navigation commands.",
    capability: "Navigate + dictate · confirm to submit",
  },
];

const steps = [
  {
    title: "Start from Chrome.",
    description:
      "Open the extension popup. Camera and microphone permissions come with a plain explanation and a live preview. If camera access is denied, keep going with voice.",
  },
  {
    title: "Set your comfortable range.",
    description:
      "Calibrate your neutral position and movement range, with a setup goal of under 30 seconds. Adjust sensitivity and dwell time, or recalibrate in one click.",
  },
  {
    title: "Point. Confirm. Browse.",
    description:
      "The cursor snaps to a link, button, or input and highlights the target. Hold for dwell selection or say “click this.” Instant pause stops pointing, voice, and dictation together.",
  },
];

const faq = [
  {
    question: "Who is Handsfree for?",
    answer:
      "People who find mouse and keyboard input difficult because of motor limits, injury, or strain. The planned Chrome extension combines head movement, broad hand gestures, and voice without specialist hardware.",
  },
  {
    question: "What stays on my device?",
    answer:
      "The spec keeps camera frames and audio on your machine. Calibration, settings, and run logs stay local. Optional arbitrary find sends only link text and your phrase to an LLM; it requires a locally stored key and is disabled without one. Handsfree has no backend or cloud store.",
  },
  {
    question: "What can I say?",
    answer:
      "Core commands include “scroll up,” “scroll down,” “go back,” “go forward,” “click this,” “open this,” “start typing,” and “stop typing.” Tab commands cover new tabs, background searches, next or previous tab, switching by title, and Chrome history, downloads, settings, or incognito. Closing a tab requires confirmation. Unknown phrases show what was heard and take no action.",
  },
  {
    question: "How does “find careers page” work?",
    answer:
      "Optional arbitrary find checks the live page, including content outside the viewport, then scrolls to and highlights a match. It asks you to choose when matches tie and takes no action when nothing matches. A missing key disables this feature with a clear message; fixed voice commands do not use an LLM.",
  },
  {
    question: "Will dictated text submit a form?",
    answer:
      "No. Dictation only inserts text and never runs navigation commands. You explicitly stop typing, make manual corrections, and separately confirm submission. Wake-word activation and automatic form filling are later work, not part of the core experience.",
  },
  {
    question: "Where will Handsfree work?",
    answer:
      "Inside supported webpages in Chrome. It does not control your operating system, and protected browser pages show a clear out-of-scope message. Read aloud and wake-word activation are deferred; offline speech is not promised.",
  },
  {
    question: "Can I use the extension yet?",
    answer:
      "This is the project landing page, not the extension. The controls described here reflect the spec and are still planned. This website does not activate your camera or microphone.",
  },
];

export default function HandsfreeLanding() {
  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <SiteHeader />
      <main id="main">
        <section
          className="hero page-width"
          id="home"
          aria-labelledby="hero-heading"
        >
          <div className="hero-copy">
            <p className="hero-eyebrow">
              <span className="eyebrow-line" aria-hidden="true" />A Chrome
              extension. Built around you.
            </p>
            <h1 id="hero-heading">
              Less clicking.
              <br />
              <span>More living.</span>
            </h1>
            <p className="hero-description">
              Point with face movements or hand gestures. Navigate and dictate
              with your voice. One considered way to browse in Chrome.
            </p>
            <div className="hero-actions">
              <Button asChild size="lg">
                <a href="#designed-for-you">
                  Meet Handsfree <ArrowUpRight data-icon="inline-end" />
                </a>
              </Button>
              <Button asChild size="lg" variant="ghost">
                <a href="#how-it-works">
                  How it works <ArrowRight data-icon="inline-end" />
                </a>
              </Button>
            </div>
          </div>
          <div className="hero-art">
            <div className="art-grid" aria-hidden="true" />
            <Image
              src="/images/handsfree-orbit-v2.webp"
              alt="A sculptural silver cursor surrounded by vivid green orbits, representing a freer way to browse."
              width={1024}
              height={1024}
              sizes="(max-width: 767px) 90vw, (max-width: 1100px) 44vw, 600px"
              preload
            />
          </div>
        </section>
        <div
          className="hardware-strip page-width"
          aria-label="Planned equipment requirements"
        >
          <p>
            More freedom.
            <br />
            <strong>Less equipment.</strong>
          </p>
          <div>
            <Webcam size={24} aria-hidden="true" />
            <span>Your everyday webcam</span>
          </div>
          <div>
            <Microphone size={24} aria-hidden="true" />
            <span>Your everyday microphone</span>
          </div>
          <div>
            <ShieldCheck size={24} aria-hidden="true" />
            <span>No specialist hardware</span>
          </div>
        </div>

        <section
          className="modes-section page-width section-spacing"
          id="designed-for-you"
          aria-labelledby="modes-heading"
        >
          <div className="section-intro">
            <h2 id="modes-heading">
              One web.
              <br />
              <span className="muted-heading">More ways in.</span>
            </h2>
            <p>
              Face movements lead. Broad hand gestures offer another pointer.
              Voice turns your intention into an action.
            </p>
          </div>
          <div className="mode-list">
            {modes.map((mode) => {
              const Icon = mode.icon;
              return (
                <article className="mode-row" key={mode.name}>
                  <div className="mode-symbol" aria-hidden="true">
                    <Icon size={38} weight="duotone" />
                  </div>
                  <div className="mode-title">
                    <h3>{mode.name}</h3>
                    <p>{mode.action}</p>
                  </div>
                  <div className="mode-description">
                    <p>{mode.description}</p>
                    <span>
                      {mode.capability}
                      <ArrowUpRight size={17} aria-hidden="true" />
                    </span>
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        <section
          className="freedom-section page-width"
          aria-labelledby="freedom-heading"
        >
          <div className="freedom-copy">
            <HandWaving size={44} weight="duotone" aria-hidden="true" />
            <h2 id="freedom-heading">
              You point.
              <br />
              You decide.
            </h2>
            <p>
              A highlighted target makes the next action clear. Selection stays
              deliberate, even when movement is uncertain.
            </p>
          </div>
          <div className="freedom-details">
            <div>
              <ShieldCheck size={28} aria-hidden="true" />
              <h3>Every action, intentional.</h3>
              <p>
                A visible dwell ring gives you time to decide, with a default
                around 800 ms. Moving away cancels it. Low tracking confidence
                blocks dwell and hand confirmation; tracking loss freezes the
                cursor.
              </p>
            </div>
            <div>
              <SlidersHorizontal size={28} aria-hidden="true" />
              <h3>A pause means everything pauses.</h3>
              <p>
                Instant pause stops the cursor, voice, and dictation together.
                Closing a tab and submitting a form always need a separate
                confirmation.
              </p>
            </div>
          </div>
        </section>

        <section
          className="setup-section page-width section-spacing"
          id="how-it-works"
          aria-labelledby="setup-heading"
        >
          <div className="setup-intro">
            <h2 id="setup-heading">
              A small setup.
              <br />
              <span className="muted-heading">A bigger world.</span>
            </h2>
            <p>
              Designed to get you comfortable quickly, and stay with you as you
              move.
            </p>
            <span className="planned-note">
              Planned Chrome extension · in development.
            </span>
          </div>
          <ol className="setup-steps">
            {steps.map((step, index) => (
              <li key={step.title}>
                <span className="step-number" aria-hidden="true">
                  0{index + 1}
                </span>
                <div>
                  <h3>{step.title}</h3>
                  <p>{step.description}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section
          className="guide-section page-width section-spacing"
          id="quick-guide"
          aria-labelledby="guide-heading"
        >
          <div className="guide-intro">
            <h2 id="guide-heading">
              Good questions.
              <br />
              <span className="muted-heading">Clear answers.</span>
            </h2>
            <p>
              Privacy, voice commands, and the boundaries of the planned
              extension.
            </p>
          </div>
          <Accordion type="single" collapsible>
            {faq.map((item, index) => (
              <AccordionItem key={item.question} value={`question-${index}`}>
                <AccordionTrigger>{item.question}</AccordionTrigger>
                <AccordionContent>
                  <p>{item.answer}</p>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </section>
      </main>
      <footer className="site-footer page-width">
        <div className="footer-top">
          <BrandLogo />
          <p>A little more freedom, online.</p>
          <a href="#home">
            Back to top <ArrowUpRight size={20} aria-hidden="true" />
          </a>
        </div>
        <div className="footer-wordmark" aria-hidden="true">
          handsfree<span>.</span>
        </div>
        <div className="footer-bottom">
          <span>A Team Loondry project.</span>
          <div>
            <a href="#quick-guide">Quick guide</a>
            <a href="#designed-for-you">Our approach</a>
          </div>
          <span>Built around people.</span>
        </div>
      </footer>
    </>
  );
}
