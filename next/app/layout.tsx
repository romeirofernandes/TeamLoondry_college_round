import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import type { ReactNode } from "react";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";

const manrope = localFont({
  src: [
    {
      path: "./fonts/manrope-latin-400-normal.woff2",
      weight: "400",
      style: "normal",
    },
    {
      path: "./fonts/manrope-latin-500-normal.woff2",
      weight: "500",
      style: "normal",
    },
    {
      path: "./fonts/manrope-latin-600-normal.woff2",
      weight: "600",
      style: "normal",
    },
    {
      path: "./fonts/manrope-latin-700-normal.woff2",
      weight: "700",
      style: "normal",
    },
  ],
  variable: "--font-manrope",
  display: "swap",
});

const spaceGrotesk = localFont({
  src: [
    {
      path: "./fonts/space-grotesk-latin-500-normal.woff2",
      weight: "500",
      style: "normal",
    },
    {
      path: "./fonts/space-grotesk-latin-600-normal.woff2",
      weight: "600",
      style: "normal",
    },
    {
      path: "./fonts/space-grotesk-latin-700-normal.woff2",
      weight: "700",
      style: "normal",
    },
  ],
  variable: "--font-space-grotesk",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Handsfree · The web, on your terms.",
  description:
    "Handsfree is a planned Chrome extension for browsing with face movements, broad hand gestures, and voice. Intentional selection, separate dictation, and local tracking.",
  icons: {
    icon: [
      { url: "/brand/handsfree-icon.svg", type: "image/svg+xml" },
      {
        url: "/brand/handsfree-icon-32.png",
        type: "image/png",
        sizes: "32x32",
      },
    ],
    apple: { url: "/brand/handsfree-icon-180.png", sizes: "180x180" },
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#f6f7f2",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${manrope.variable} ${spaceGrotesk.variable}`}
    >
      <body>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          storageKey="handsfree-theme"
        >
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
