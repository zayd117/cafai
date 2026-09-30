// The plan's minimum legal set (§24) needs counsel review; no legal text is invented here (REGISTER A-038).
export function LegalPlaceholder({ title }: { title: string }) {
  return (
    <main className="page">
      <section className="state counter">
        <span className="tag">Not written yet</span>
        <h1>{title}</h1>
        <p>This page will be written with legal counsel before public launch (plan §24).</p>
      </section>
    </main>
  );
}
