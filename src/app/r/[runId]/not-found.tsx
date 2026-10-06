// Plan does not specify this state (wireframe board 6: "Run link not found, or its anonymous text has expired"). REGISTER A-030.
import { ArrowRightIcon } from "../../_components/icons";

export const metadata = { title: "Order not found" };

export default function RunNotFound() {
  return (
    <main className="page">
      <section className="notice">
        <h1>We can&apos;t find that order.</h1>
        <p>The link may be mistyped, or it may be too old. Order links stop working after a while.</p>
        <a className="btn primary fit" href="/">Start a new order<ArrowRightIcon /></a>
      </section>
    </main>
  );
}
