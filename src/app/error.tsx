"use client";
// No internal details reach the page (plan §14: error information leakage). Details stay in server logs.
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="page">
      <section className="state counter">
        <h1>Something went wrong.</h1>
        <p>Please try again.</p>
        <button className="btn primary fit" onClick={() => reset()}>Try again</button>
      </section>
    </main>
  );
}
