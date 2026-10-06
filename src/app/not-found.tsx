// Site-wide 404. Without it Next serves its default page, whose inline styles the strict CSP blocks (src/proxy.ts).
import { ArrowRightIcon } from "./_components/icons";

export const metadata = { title: "Page not found" };

export default function NotFound() {
  return (
    <main className="page">
      <section className="notice">
        <h1>We can’t find that page.</h1>
        <p>The link may be mistyped, or the page may have moved.</p>
        <a className="btn primary fit" href="/">Start a new order<ArrowRightIcon /></a>
      </section>
    </main>
  );
}
