import type { Metadata } from "next";
import { DownloadSimple, ArrowUpRight } from "@phosphor-icons/react/dist/ssr";
import BrandLogo from "@/components/brand-logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import packages from "@/public/downloads/packages.json";
import "./downloads.css";

export const metadata: Metadata = {
  title: "Downloads · Handsfree",
  description: "Download Handsfree for Chrome or Firefox and follow the installation steps for your browser.",
};

export default function DownloadsPage() {
  return (
    <div className="handsfree-downloads">
      <a className="skip-link" href="#downloads-main">Skip to downloads</a>
      <header className="downloads-header">
        <BrandLogo href="/" />
        <nav aria-label="Downloads navigation">
          <a href="/docs">Docs</a>
          <a href="/dashboard">Open Handsfree <ArrowUpRight aria-hidden="true" /></a>
          <ThemeToggle />
        </nav>
      </header>
      <main id="downloads-main" className="downloads-main">
        <div className="downloads-intro">
          <p className="downloads-eyebrow">Get Handsfree</p>
          <h1>Your browser. Your controls.</h1>
          <p>Download the ZIP for your browser, then follow the steps below. These are desktop preview builds with manual installation.</p>
        </div>
        <aside className="downloads-prerequisite" aria-labelledby="before-installing">
          <h2 id="before-installing">Before you install</h2>
          <p>Both builds open the dashboard at <code>http://localhost:3000/dashboard</code>. Run the website on your computer using the steps below before starting setup. This currently requires access to the private project repository.</p>
          <a href="#local-dashboard">Set up the local dashboard <ArrowUpRight aria-hidden="true" /></a>
        </aside>
        <div className="download-options">
          <section id="chrome" aria-labelledby="chrome-title" className="download-browser">
            <div className="download-browser-heading">
              <h2 id="chrome-title">Chrome</h2>
              <span>Chrome 120+</span>
            </div>
            <p>Install the unpacked extension from the extracted folder.</p>
            <Button asChild size="lg" className="download-button">
              <a href={`/downloads/${packages.chrome.filename}`} download><DownloadSimple aria-hidden="true" /> Download Chrome ZIP</a>
            </Button>
            <p className="download-file-info">Version {packages.chrome.version} · {(packages.chrome.bytes / 1024 / 1024).toFixed(1)} MB · ZIP</p>
            <h3>Install in Chrome</h3>
            <ol>
              <li>Download and extract the ZIP into a folder you can keep.</li>
              <li>Type <code>chrome://extensions</code> into the address bar and press Enter.</li>
              <li>Turn on <strong>Developer mode</strong>, then choose <strong>Load unpacked</strong>.</li>
              <li>Select the extracted folder containing <code>manifest.json</code>.</li>
              <li>Pin Handsfree from the extensions menu. Open it and choose the dashboard to complete setup.</li>
            </ol>
            <p className="download-browser-note">Keep the extracted folder in place. To update, replace its contents and choose Reload on the extensions page.</p>
            <a className="download-reference" href="https://developer.chrome.com/docs/extensions/get-started/tutorial/hello-world#load-unpacked">Chrome installation reference <ArrowUpRight aria-hidden="true" /></a>
          </section>
          <section id="firefox" aria-labelledby="firefox-title" className="download-browser">
            <div className="download-browser-heading">
              <h2 id="firefox-title">Firefox</h2>
              <span>Firefox 142+</span>
            </div>
            <p>Try the experimental build as a temporary add-on.</p>
            <Button asChild size="lg" className="download-button">
              <a href={`/downloads/${packages.firefox.filename}`} download><DownloadSimple aria-hidden="true" /> Download Firefox ZIP</a>
            </Button>
            <p className="download-file-info">Version {packages.firefox.version} · {(packages.firefox.bytes / 1024 / 1024).toFixed(1)} MB · ZIP</p>
            <h3>Install in Firefox</h3>
            <ol>
              <li>Download and extract the ZIP into a folder.</li>
              <li>Type <code>about:debugging#/runtime/this-firefox</code> into the address bar and press Enter.</li>
              <li>Choose <strong>Load Temporary Add-on</strong>.</li>
              <li>Select <code>manifest.json</code> inside the extracted folder.</li>
              <li>Open Handsfree from the extensions menu, then open the dashboard to complete setup.</li>
            </ol>
            <p className="download-browser-note">This ZIP is unsigned. Reload it with these steps after restarting Firefox. A permanent installation needs a Mozilla-signed add-on.</p>
            <a className="download-reference" href="https://extensionworkshop.com/documentation/develop/temporary-installation-in-firefox/">Firefox installation reference <ArrowUpRight aria-hidden="true" /></a>
          </section>
        </div>
        <section id="local-dashboard" className="downloads-setup" aria-labelledby="dashboard-title">
          <div>
            <p className="downloads-eyebrow">One setup for both browsers</p>
            <h2 id="dashboard-title">Start your local dashboard</h2>
            <p>You need access to the private project repository, Node.js 20.9 or newer, and Git. Run these commands in a terminal, then keep it open while using Handsfree.</p>
          </div>
          <div>
            <pre><code>{`git clone https://github.com/romeirofernandes/TeamLoondry_college_round.git\ncd TeamLoondry_college_round/next\nnpm ci\nnpm run dev`}</code></pre>
            <p>If you already have the project, run the last two commands from its <code>next</code> folder.</p>
            <a href="http://localhost:3000/dashboard" className="download-reference">Open local dashboard <ArrowUpRight aria-hidden="true" /></a>
          </div>
        </section>
        <section className="downloads-setup" aria-labelledby="after-installing">
          <div><h2 id="after-installing">Choose how you browse</h2><p>Use voice, head movement, hand movement, or a combination. Allow camera or microphone access only for the controls you choose.</p></div>
          <div>
            <p>Refresh any webpages that were open before installation. Start on an ordinary website; browser settings and other protected pages cannot use the pointer overlay.</p>
            <p>In Firefox, keep the Handsfree capture tab open during your session. Voice needs your own Groq key in the popup&apos;s <strong>Voice services</strong> page and sends microphone audio to Groq. On-device dictation is currently unavailable in Firefox.</p>
            <p>Neither download includes provider keys. Optional cloud commands need your own configuration.</p>
            <a className="download-reference" href="/docs">Read the controls and commands guide <ArrowUpRight aria-hidden="true" /></a>
          </div>
        </section>
        <footer className="downloads-footer"><a href="/">Back to the website</a><span>Handsfree by Team Loondry</span></footer>
      </main>
    </div>
  );
}
