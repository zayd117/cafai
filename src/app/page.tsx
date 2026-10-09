import { ENGINE_CONFIG } from "@/engine/config";
import { submitOrder } from "./actions";
import { ProjectInput } from "./_components/ProjectInput";
import { SubmitButton } from "./_components/SubmitButton";

export const dynamic = "force-dynamic";

// Example prompts are the plan's own journeys (§6, §7), never invented ones.
// Each has a short chip label; the full journey text is what gets submitted.
const EXAMPLES = [
  ["Calorie tracker app", "I'm making a calorie and macro tracker app for phones. I use Claude Code. I don't really know what I need."],
  ["Excel change alerts", "I'm writing a Tampermonkey script that reads visible Excel cells and notifies me when something changes."],
  ["Weekly Shopify report", "Every Monday I export Shopify orders to Google Sheets and build a sales summary. I use Claude Desktop, and ChatGPT at work."],
] as const;
// Rotating placeholder text, shortened from the same journeys.
const HINTS = [
  "I'm creating a calorie and macro tracker app for mobile",
  "a script that tells me when visible Excel cells change",
  "a weekly sales summary from Shopify orders in Google Sheets",
] as const;
const STEPS = ["Describe your project", "Get 3–5 explained picks", "Set them up in your AI tool"];
// Copy for these states is not in the plan (wireframe board 6 lists them as unspecified); placeholder wording, REGISTER A-030.
const ERRORS: Record<string, string> = {
  empty: "Describe what you are working on, or pick an example below.",
  quota: "You have made a lot of orders in the last hour. Please try again later.",
  paused: "New orders are paused for a moment. Please try again later.",
};
const CLIENTS = [
  ["claude_code", "Claude Code"],
  ["cursor", "Cursor"],
  ["claude_desktop", "Claude Desktop"],
  ["other", "Other"],
] as const;

export default async function Counter({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <main className="page intake-page">
      <div className="intake-layout">
        <section className="hero intake-intro" aria-labelledby="project-heading">
          <p className="intake-kicker"><span aria-hidden="true" />A little help choosing what comes next</p>
          <h1 id="project-heading">What are you <span>working on?</span></h1>
          <p className="lede">You bring the work. <br />We know the menu.</p>
          <p className="intake-description">Tell us what you&apos;re making. We&apos;ll help you choose a few tools, explain why they fit, and show you the next step.</p>
          <ol className="steps" aria-label="How it works">
            {STEPS.map((s, n) => (
              <li key={s} {...(n === 0 ? { "aria-current": "step" as const } : {})}><span className="step-n" aria-hidden="true">{n + 1}</span>{s}</li>
            ))}
          </ol>
        </section>
        <form action={submitOrder} className="counter">
          <div className="composer">
            <label htmlFor="text" className="composer-label">Your project</label>
            <ProjectInput
              id="text" name="text" className="textarea" maxLength={ENGINE_CONFIG.input.maxChars} hints={HINTS}
              aria-describedby="text-help" {...(error === "empty" ? { "aria-invalid": true } : {})}
            />
            {error && ERRORS[error] && <p className="small error" role="alert">{ERRORS[error]}</p>}
            <div className="composer-bar">
              <fieldset className="chips compact">
                <legend className="small muted">AI tools I use <span className="sr-only">(optional)</span></legend>
                {CLIENTS.map(([id, label]) => (
                  <label key={id} className="chip">
                    <input type="checkbox" name="clients" value={id} />
                    <span>{label}</span>
                  </label>
                ))}
              </fieldset>
              <SubmitButton className="btn primary send" pendingText="Finding your picks…">
                What do you recommend?
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 19V5M5 12l7-7 7 7" /></svg>
              </SubmitButton>
            </div>
          </div>
          <div className="row small muted under" id="text-help">
            <span>Plain words are fine, no tool names needed. Don&apos;t paste secrets; we redact them.</span>
            <span>Up to {ENGINE_CONFIG.input.maxChars.toLocaleString("en-US")} characters</span>
          </div>

          <details className="more">
            <summary>Something specific in mind? <span className="muted">Optional</span></summary>
            <div className="field">
              <label htmlFor="specific" className="sr-only">Something specific in mind?</label>
              <input id="specific" name="specific" className="input" maxLength={300} placeholder="e.g. something to help me analyze Excel data" />
              <span className="small muted">Naming a tool works too. It only sharpens the picks; you never have to.</span>
            </div>
          </details>

          <div className="hp" aria-hidden="true">
            <label htmlFor="website">Leave this empty</label>
            <input id="website" name="website" tabIndex={-1} autoComplete="off" />
          </div>

          <section aria-labelledby="examples" className="try">
            <h2 id="examples" className="small muted">Or try an example</h2>
            <div className="example-chips">
              {EXAMPLES.map(([label, text]) => (
                <SubmitButton key={label} name="example" value={text} className="example-chip" formNoValidate pendingText="Opening example…"
                  aria-label={`${label}: ${text}`} title={text}>{label}</SubmitButton>
              ))}
            </div>
          </section>

          <p className="muted small intake-promise">No sign-up needed. Caf.ai never installs anything for you.</p>
        </form>
      </div>
    </main>
  );
}
