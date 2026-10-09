import type { ReactNode } from "react";
import { Bricolage_Grotesque, Instrument_Sans, JetBrains_Mono } from "next/font/google";
import { ModeBanner } from "./_components/ModeBanner";
import "./tokens.css";
import "./globals.css";

// Faces from the design system (docs/design); self-hosted by next/font at build (no runtime font host, CSP font-src 'self').
const sans = Instrument_Sans({ subsets: ["latin"], variable: "--font-instrument-sans" });
const mono = JetBrains_Mono({ weight: ["400"], subsets: ["latin"], variable: "--font-jetbrains-mono" });
// Wordmark face only (docs/design/UX_DECISIONS.md §10).
const wordmark = Bricolage_Grotesque({ weight: ["700"], subsets: ["latin"], variable: "--font-bricolage" });

export const metadata = {
  title: { default: "Caf.ai", template: "%s | Caf.ai" },
  description: "Describe what you are working on and get a few explained picks of AI tools to add, set up by your own AI tool.",
};

export const viewport = { themeColor: "#F7F5F0" }; // --color-bg-canvas

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable} ${wordmark.variable}`}>
      <body>
        <a className="skip-link" href="#main">Skip to content</a>
        <header className="topbar">
          <a href="/" className="brand" aria-label="Caf.ai home">
            {/* Mark: public/brand/cafai-mark.svg; the favicon is its simplified small size (src/app/icon.svg). */}
            <img className="brand-mark" src="/brand/cafai-mark.svg" width={44} height={44} alt="" />
            <span className="wordmark" translate="no">caf<span className="wordmark-dot">.</span>ai</span>
          </a>
          <nav className="nav" aria-label="Main">
            <a href="/">New order</a>
          </nav>
        </header>
        {/* The sample-mode note sits inside main, so "Skip to content" never skips it. */}
        <div id="main" className="main" tabIndex={-1}>
          <ModeBanner />
          {children}
        </div>
        <footer className="footer">
          <div className="footer-intro"><span className="wordmark" translate="no">caf<span className="wordmark-dot">.</span>ai</span><span>A few good tools. A place to start.</span></div>
          <div className="footer-detail">
            {/* Disclaimers the plan requires (§14 self-audit: "the UI says so plainly"; §24 legal set; §5 principles 6 and 10). */}
            <p>Picks and explanations are written with AI help and can be wrong. Check a tool before you add it.</p>
            <p>We check the tools we suggest, but once you install a tool we cannot stop it from misbehaving. Caf.ai never installs anything and holds no keys to your other services.</p>
            <p>Nobody can pay for a place in our picks.</p>
            <nav aria-label="Legal" className="row small">
              <a href="/terms">Terms</a>
              <a href="/privacy">Privacy</a>
              <a href="/security">Security contact</a>
            </nav>
          </div>
        </footer>
      </body>
    </html>
  );
}
