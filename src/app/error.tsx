"use client";
// No internal details reach the page (plan §14: error information leakage). Details stay in server logs.
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="page">
      <section className="notice">
        <h1>Something went wrong.</h1>
        <p>Please try again. If it keeps happening, start a new order.</p>
        <div className="form-buttons">
          <button className="btn primary" onClick={() => reset()}>Try again</button>
          <a className="btn" href="/">Start a new order</a>
        </div>
      </section>
    </main>
  );
}
