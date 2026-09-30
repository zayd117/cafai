import { ENGINE_CONFIG } from "@/engine/config";
import { submitOrder } from "./actions";

export const dynamic = "force-dynamic";

// Example prompts are the plan's own journeys (§6, §7), never invented ones.
const EXAMPLES = [
  "I'm making a calorie and macro tracker app for phones. I use Claude Code. I don't really know what I need.",
  "I'm writing a Tampermonkey script that reads visible Excel cells and notifies me when something changes.",
  "Every Monday I export Shopify orders to Google Sheets and build a sales summary. I use Claude Desktop, and ChatGPT at work.",
];
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
    <main className="page">
      <form action={submitOrder} className="counter">
        <div className="hero">
          <h1>What are you working on?</h1>
          <p className="lede">You bring the work. We know the menu.</p>
          <p className="muted">Describe it in your own words. You do not need to know any tool names.</p>
        </div>

        <div className="box">
          <div className="box-section">
            <label htmlFor="text" className="legend">Your project</label>
            <textarea
              id="text" name="text" className="textarea" maxLength={ENGINE_CONFIG.input.maxChars}
              placeholder="e.g. I'm creating a calorie and macro tracker app for mobile"
              aria-describedby="text-help" {...(error === "empty" ? { "aria-invalid": true } : {})}
            />
            {error && ERRORS[error] && <p className="small" role="alert">{ERRORS[error]}</p>}
            <div className="row small muted" id="text-help">
              <span>Don&apos;t paste secrets; we redact them.</span>
              <span>Up to {ENGINE_CONFIG.input.maxChars.toLocaleString("en-US")} characters</span>
            </div>
          </div>

          <div className="box-section">
            <div className="row"><strong>A little more, if you like</strong><span className="small muted">All optional</span></div>
            <fieldset className="chips">
              <legend className="legend">AI tools I use</legend>
              {CLIENTS.map(([id, label]) => (
                <label key={id} className="chip">
                  <input type="checkbox" name="clients" value={id} />
                  <span>{label}</span>
                </label>
              ))}
            </fieldset>
            <div className="field">
              <label htmlFor="specific">Something specific in mind?</label>
              <input id="specific" name="specific" className="input" maxLength={300} placeholder="e.g. something to help me analyze Excel data" />
              <span className="small muted">Naming a tool works too. It only sharpens the picks; you never have to.</span>
            </div>
          </div>

          <div className="hp" aria-hidden="true">
            <label htmlFor="website">Leave this empty</label>
            <input id="website" name="website" tabIndex={-1} autoComplete="off" />
          </div>
          <div className="box-section row">
            <span className="muted">No sign-up needed to try it.</span>
            <button type="submit" className="btn primary">What do you recommend?</button>
          </div>
        </div>

        <section aria-labelledby="examples" className="stack">
          <h2 id="examples" className="legend">Or start from an example</h2>
          <div className="examples">
            {EXAMPLES.map((e) => (
              <button key={e} type="submit" name="example" value={e} className="example" formNoValidate>{e}</button>
            ))}
          </div>
        </section>

        <p className="muted small hero">Caf.ai never installs anything for you.</p>
      </form>
    </main>
  );
}
