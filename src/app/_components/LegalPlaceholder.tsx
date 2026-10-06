// The plan's minimum legal set (§24) needs counsel review; no legal text is invented here (REGISTER A-038).
import { ArrowRightIcon } from "./icons";

export function LegalPlaceholder({ title }: { title: string }) {
  return (
    <main className="page">
      <section className="notice">
        <p className="status-pill">Not written yet</p>
        <h1>{title}</h1>
        <p>We are writing this page with legal counsel. It will be here before Caf.ai opens to the public.</p>
        <a className="btn fit" href="/">Start a new order<ArrowRightIcon /></a>
      </section>
    </main>
  );
}
