// Plan does not specify this state (wireframe board 6: "Run link not found, or its anonymous text has expired"). REGISTER A-030.
export default function RunNotFound() {
  return (
    <main className="page">
      <section className="state counter">
        <h1>We can&apos;t find that order.</h1>
        <p>The link may be wrong, or an unsaved order may have expired.</p>
        <a className="btn primary" href="/">Start a new order</a>
      </section>
    </main>
  );
}
