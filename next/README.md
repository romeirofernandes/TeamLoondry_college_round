# Handsfree website

Next.js App Router landing page and connected dashboard with Tailwind CSS v4 and shadcn/ui (Radix Nova). Requires Node.js 20.9 or later.

Run commands from this directory:

```bash
npm install
npm run dev
```

Open `http://localhost:3000`. The session dashboard is at `/dashboard`; open it from the extension popup to connect. It manages calibration, pointer settings, speech, tabs, provider keys, and local activity. Tracking and microphone capture run in the extension offscreen document, so switching away from the dashboard does not stop the session.

First visits open a three-step setup. Choose any combination of voice, head movement, and hand movement. When both pointers are selected, choose a primary pointer and switch deliberately; voice can stay on alongside either pointer. Preferences and setup progress stay in extension storage. Existing pointer tuning and calibrations are preserved.

Setup offers spoken guidance after five seconds without interaction. This offer does not start a session or microphone recording. Choose **Read setup aloud** for narration or **Listen for setup commands** after allowing the microphone. Setup speech stays on the dashboard and pauses recognition while the assistant speaks. Screen readers and the keyboard can use the same labelled controls.

Chrome grants extension device permissions in a small access window. It requests only the selected devices and provides **Return to Handsfree**, keeping your place in setup. Voice-only setup never requests a camera. Camera previews need an explicit **Show camera preview** action.

The dashboard separates Session, Tabs, and Help. The top-right **Profile** button opens input, pointer, speech, and browser-access preferences. Provider configuration and testing recipients are under Advanced. Use **Replay setup** to revisit onboarding. Reload the unpacked extension after rebuilding; the extension now declares Chrome's `tts` permission for setup narration.

For production:

```bash
npm run build
npm start
```

Use `npm run dev` while editing. If you rebuild a running production preview, stop and restart `npm start` so its HTML and generated assets come from the same build.

TypeScript check: `npm run typecheck`.

## Interaction modes

- **Voice:** fixed navigation and tab commands, separate dictation, optional Jev text mapping, and Groq requests beginning with "hey handsfree". Chrome speech is the default; Groq recorded-audio transcription is a fallback. On-device speech is an explicit dashboard choice requiring browser support and a language pack.
- **Hand gestures:** broad movement as a second pointer with hold confirmation; no pinch required.
- **Face movements:** primary in-page pointer with smoothing, posture adaptation, and adjustable sensitivity.

Content follows the repository-root `spec.md`: Chrome-only scope, intentional selection, instant pause, local tracking/settings/logs, provider-assisted commands and target finding, and explicit confirmations for form submission and tab closing. The page introduces each mode with three editorial feature rows, a setup overview, and a quick-guide accordion. The development extension lives in `../extension/`; see the [root README](../README.md) for building, loading, and testing it. Voice typing belongs to the voice mode. Real-device performance still needs evaluation.

The website needs no authentication or environment variables. Provider credentials stay in extension storage or its generated local configuration, and are never returned to the dashboard. The dashboard sends commands through a same-origin message bridge injected only into an authorized dashboard tab. A single shadcn Button toggles light/dark mode through `next-themes` and remembers the choice locally. The page follows the system theme initially and respects the operating system’s reduced-motion preference automatically.

## Logo

The custom geometric lowercase `h` monogram and Space Grotesk wordmark use flat colors and vector geometry. The wordmark exports contain outlined glyphs, so they render without an installed font.

- `public/brand/handsfree-logo.svg`: transparent full logo for light backgrounds.
- `public/brand/handsfree-logo-dark.svg`: transparent full logo for dark backgrounds.
- `public/brand/handsfree-symbol.svg`: standalone monogram.
- `public/brand/handsfree-icon.svg`: matching app icon/favicon, with 32px and 180px PNG variants.

Header and footer use the same monogram through `components/brand-logo.tsx`, with colors following the page theme. Font licensing is included in `app/fonts/space-grotesk-LICENSE.txt`.

## Visual design

The revamped landing uses charcoal/ivory themes, vivid green accents, oversized Manrope headlines, a three-mode feature list, a comfort/intentional-selection section, a compact setup guide, and a large wordmark footer. Main content is server-rendered; navigation, theme, and FAQ remain small interactive components. No content is hidden behind entrance animations.

## Hero artwork

Saved asset: `public/images/handsfree-orbit-v2.webp` (transparent, 1254 × 1254). Generated using the built-in image-generation tool and converted to WebP with alpha preserved. The earlier hero asset remains available but is no longer displayed.

Final generation prompt:

> Use case: stylized-concept. Asset type: isolated transparent PNG hero artwork for Handsfree, an accessible browsing landing page with a refined charcoal and electric-lime visual identity. Create one extremely polished 3D sculptural browser cursor, a chunky satin silver/chrome arrow pointing upper-left, angled in three-quarter view, suspended within two very thin elliptical electric-lime green orbital rings. The cursor is the dominant object and feels like premium industrial design: clean sharp silhouette, softly chamfered edges, believable silver metallic highlights with deep dark reflections, subtle brushed metal, sculptural thickness. Include one small dark metallic sphere on the orbit to balance the composition. Restrained studio product-render lighting, soft but crisp rim lights, no bloom. Square composition, object comfortably centered with about 10 percent transparent margin, filling most of the frame. True transparent background; no scene, no floor, no rectangular backdrop, no typography, no logos, no text, no UI, no extra icons, no pastel clay, no cartoon eyes, no watermark. This will sit on both ivory and charcoal website backgrounds.
