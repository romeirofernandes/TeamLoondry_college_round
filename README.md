# Handsfree

An accessibility-focused landing page for browsing through voice, hand gestures, and face movements. The website lives in [`next/`](./next) and uses Next.js App Router, React, TypeScript, Tailwind CSS v4, and shadcn/ui.

## Run locally

```bash
cd next
npm install
npm run dev
```

Open `http://localhost:3000`.

```bash
npm run build
npm start
```

Run these commands inside `next/`. `npm run build` creates the production build in `next/.next/`; `npm start` serves it. Run `npm run typecheck` for TypeScript checks. No environment variables or separate backend are needed.

## Structure

- `next/app/layout.tsx`: document layout, metadata, and self-hosted fonts through `next/font/local`.
- `next/app/page.tsx`: homepage route.
- `next/components/handsfree-landing.tsx`: server-rendered landing content and quick-guide FAQ.
- `next/components/site-header.tsx`: responsive navigation.
- `next/components/theme-toggle.tsx`: simple shadcn light/dark toggle using `next-themes`.
- `next/app/globals.css`: responsive design and accessibility/theme tokens.
- `next/public/`: images, favicon, and robots.txt. The hero uses `next/image` for optimized delivery.

## Current scope

Landing page only, with three interaction-mode descriptions, intentional activation and comfort principles, a planned setup overview, and a same-page quick guide. Real tracking, speech recognition, and a browser extension are future work. No demos, authentication, or webcam/microphone permission requests are included.

Accessibility features include large interactive targets, keyboard navigation, a skip link, visible focus, a shadcn FAQ accordion, and a simple light/dark toggle. The theme starts with the system preference and remembers the user's choice. The page automatically respects the operating system's reduced-motion preference.

The 30-second calibration target and other assistive browsing capabilities are project goals, not evaluated performance claims.

## Hero asset

`next/public/images/handsfree-orbit-v2.webp` is a transparent chrome cursor and green orbit illustration generated with the built-in image tool. The full generation prompt and logo export paths are documented in [`next/README.md`](./next/README.md).
