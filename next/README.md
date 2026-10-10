# Handsfree website

Next.js App Router landing page with Tailwind CSS v4 and shadcn/ui (Radix Nova). Requires Node.js 20.9 or later.

Run commands from this directory:

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

For production:

```bash
npm run build
npm start
```

Use `npm run dev` while editing. If you rebuild a running production preview, stop and restart `npm start` so its HTML and generated assets come from the same build.

TypeScript check: `npm run typecheck`.

## Interaction modes

- **Voice:** navigation commands and voice typing.
- **Hand gestures:** webcam-based cursor movement and deliberate gesture selection.
- **Face movements:** webcam-based cursor movement with adjustable sensitivity.

The page introduces each mode with three editorial feature rows, a setup overview, and a quick-guide accordion. Real camera/microphone control and a browser extension are future work. Voice typing belongs to the voice mode.

No authentication or environment variables are required. A single shadcn Button toggles light/dark mode through `next-themes` and remembers the choice locally. The page follows the system theme initially and respects the operating system’s reduced-motion preference automatically.

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
