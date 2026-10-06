import type { ReactNode } from "react";
import { Instrument_Sans, JetBrains_Mono } from "next/font/google";
import { ModeBanner } from "./_components/ModeBanner";
import "./tokens.css";
import "./globals.css";

// Faces from the design system (docs/design); self-hosted by next/font at build (no runtime font host, CSP font-src 'self').
const sans = Instrument_Sans({ subsets: ["latin"], variable: "--font-instrument-sans" });
const mono = JetBrains_Mono({ weight: ["400"], subsets: ["latin"], variable: "--font-jetbrains-mono" });

export const metadata = {
  title: { default: "Caf.ai", template: "%s | Caf.ai" },
  description: "Describe what you are working on and get a few explained picks of AI tools to add, set up by your own AI tool.",
  // PLACEHOLDER icon (src/app/icon.svg): the header's cup mark until a brand icon exists (REGISTER A-016).
};

export const viewport = { themeColor: "#F7F5F0" }; // --color-bg-canvas

function CupIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#FFFAF3" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 9h12v4a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5Z" />
      <path d="M16 10h1.5a2.5 2.5 0 0 1 0 5H16" />
      <path d="M3 21h15" />
      <path d="M8 3c-.8 1-.8 2 0 3" />
      <path d="M12 3c-.8 1-.8 2 0 3" />
    </svg>
  );
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <body>
        <a className="skip-link" href="#main">Skip to content</a>
        <header className="topbar">
          <a href="/" className="brand" aria-label="Caf.ai home">
            <span className="brand-mark" aria-hidden="true"><CupIcon /></span>
            <span translate="no">Caf.ai</span>
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
          {/* Disclaimers the plan requires (§14 self-audit: "the UI says so plainly"; §24 legal set; §5 principles 6 and 10). */}
          <p>Picks and explanations are written with AI help and can be wrong. Check a tool before you add it.</p>
          <p>We check the tools we suggest, but once you install a tool we cannot stop it from misbehaving. Caf.ai never installs anything and holds no keys to your other services.</p>
          <p>Nobody can pay for a place in our picks.</p>
          <nav aria-label="Legal" className="row small">
            <a href="/terms">Terms</a>
            <a href="/privacy">Privacy</a>
            <a href="/security">Security contact</a>
          </nav>
        </footer>
      </body>
    </html>
  );
}
