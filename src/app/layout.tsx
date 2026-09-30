import type { ReactNode } from "react";
import { Courier_Prime, Figtree, Young_Serif } from "next/font/google";
import { ModeBanner } from "./_components/ModeBanner";
import "./globals.css";

// Faces from the v3.1 wireframes; self-hosted by next/font at build (no runtime font host, CSP font-src 'self').
const display = Young_Serif({ weight: "400", subsets: ["latin"], variable: "--font-display" });
const body = Figtree({ subsets: ["latin"], variable: "--font-body" });
const mono = Courier_Prime({ weight: ["400", "700"], subsets: ["latin"], variable: "--font-mono" });

export const metadata = {
  title: "Caf.ai",
  // PLACEHOLDER: no brand icon exists in the plan or wireframes yet (REGISTER A-016).
  icons: { icon: "data:," },
};

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
    <html lang="en" className={`${display.variable} ${body.variable} ${mono.variable}`}>
      <body>
        <header className="topbar">
          <a href="/" className="brand" aria-label="Caf.ai home">
            <span className="brand-mark" aria-hidden="true"><CupIcon /></span>
            Caf.ai
          </a>
          <nav className="nav" aria-label="Main">
            <a href="/">New order</a>
          </nav>
        </header>
        <ModeBanner />
        {children}
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
