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
    name: "Voice",
    icon: Microphone,
    action: "Say it. Do it.",
    description:
      "Click, scroll, open links, and put your thoughts into words. A few words can take you a long way.",
    capability: "Navigate + dictate",
  },
  {
    name: "Hand gestures",
    icon: HandWaving,
    action: "A little movement. A new direction.",
    description:
      "Guide the cursor with deliberate hand movements. Point and select in a way that feels natural to you.",
    capability: "Point + select",
  },
  {
    name: "Face movements",
    icon: HeadCircuit,
    action: "Go at your own pace.",
    description:
      "Move your face to guide the cursor. Adjustable sensitivity is designed to work with your range of movement.",
    capability: "Move + navigate",
  },
];

const steps = [
  {
    title: "Get comfortable.",
    description:
      "Your usual position. Your everyday webcam and microphone. Nothing special to buy.",
  },
  {
    title: "Make it feel like you.",
    description:
      "Choose your control mode and adjust sensitivity. Quick calibration is designed to take under 30 seconds.",
  },
  {
    title: "Find your way around.",
    description:
      "Speak, gesture, or move your face. Combine the modes and pause whenever you need a moment.",
  },
];

const faq = [
  {
    question: "Who is Handsfree for?",
    answer:
      "Anyone who finds a mouse or keyboard difficult or uncomfortable to use, including people with motor impairments, temporary injuries, or repetitive strain. Handsfree is being designed around different needs and different ways of moving.",
  },
  {
    question: "Do I need any special equipment?",
    answer:
      "The planned experience uses a standard webcam and microphone, including the ones built into your laptop. No dedicated tracking device is part of the design.",
  },
  {
    question: "How will accidental clicks be prevented?",
    answer:
      "Moving the cursor should not click anything on its own. Adjustable dwell selection, deliberate gestures, and voice confirmation are designed to make each action intentional.",
  },
  {
    question: "Can I install or use Handsfree yet?",
    answer:
      "Handsfree is in development. This page introduces the project. The browser extension, camera tracking, and speech controls are still being built.",
  },
  {
    question: "What about lighting and background noise?",
    answer:
      "Adapting to lighting, posture, and background noise is a project goal. We plan to evaluate reliability, command accuracy, task completion time, selection errors, and accidental activations in real conditions.",
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
              <span className="eyebrow-line" aria-hidden="true" />
              The web, on your terms.
            </p>
            <h1 id="hero-heading">
              Less clicking.
              <br />
              <span>More living.</span>
            </h1>
            <p className="hero-description">
              Browse with your voice, hand gestures, or face movements. Find the
              way that works for you.
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
              Choose what feels right. Mix things up. Handsfree is designed to
              meet you where you are.
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
              Different needs.
              <br />
              Same possibilities.
            </h2>
            <p>
              For motor impairments, an injury, or simply a little less strain.
              The web should fit your life.
            </p>
          </div>
          <div className="freedom-details">
            <div>
              <ShieldCheck size={28} aria-hidden="true" />
              <h3>Every action, intentional.</h3>
              <p>
                Dwell selection, deliberate gestures, and voice confirmation.
                Designed to keep accidental clicks out of your way.
              </p>
            </div>
            <div>
              <SlidersHorizontal size={28} aria-hidden="true" />
              <h3>Your comfort sets the pace.</h3>
              <p>
                Adjustable sensitivity, a choice of controls, and the freedom to
                pause. You decide what works for you.
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
              The planned browser experience.
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
            <p>A quick guide to Handsfree, and what comes next.</p>
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
