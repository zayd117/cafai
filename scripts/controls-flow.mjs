// Browser check of L8 controls against a running app and its database (dev only).
// Usage: DATABASE_OWNER_URL=... node scripts/controls-flow.mjs <baseUrl>   (server started with CAFAI_RUNS_PER_HOUR=3)
import { chromium } from "playwright-core";
import pg from "pg";

const base = process.argv[2] ?? "http://localhost:3101";
const owner = new pg.Pool({ connectionString: process.env.DATABASE_OWNER_URL });
const setFlag = (key, enabled) => owner.query("INSERT INTO flags (key, enabled) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET enabled = $2, updated_at = now()", [key, enabled]);
const checks = [];
const expect = (name, ok) => checks.push(`${ok ? "PASS" : "FAIL"} ${name}`);
await owner.query("DELETE FROM quota_counters");
for (const k of ["ai_off", "runs_off", "revoke:fx-nutrition-data"]) await setFlag(k, false);

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const submit = async (text) => {
  await page.goto(`${base}/`);
  await page.getByLabel("Your project").fill(text);
  await page.getByRole("button", { name: "What do you recommend?" }).click();
  await page.waitForLoadState("networkidle");
};
const CAL = "I'm making a calorie and macro tracker app for phones. I use Claude Code. I don't really know what I need.";

// 1. Revocation annotates an existing run and hides its setup.
await submit(CAL);
const runUrl = page.url();
await setFlag("revoke:fx-nutrition-data", true);
await page.goto(runUrl);
expect("revoked pick annotated on old run", await page.getByText("We no longer recommend this").isVisible());
await page.screenshot({ path: "docs/figma-handoff/screens/09-revoked-pick-desktop.png", fullPage: false });
await page.getByRole("button", { name: /^Set up in/ }).click();
await page.waitForURL(/\/setup/);
expect("revoked pick has no setup section", !(await page.getByRole("heading", { name: "Sample nutrition data service" }).isVisible()));
await setFlag("revoke:fx-nutrition-data", false);

// 2. AI off: the run still completes, degraded, with the banner.
await setFlag("ai_off", true);
await submit("Before launch I test signup flow by hand every day.");
expect("ai_off run shows degraded banner", await page.getByText("Our AI helper was unavailable for this order").isVisible());
expect("ai_off run asks to confirm the read-back first", await page.getByRole("heading", { name: "Is this right?" }).isVisible());
await page.screenshot({ path: "docs/figma-handoff/screens/10-ai-off-desktop.png", fullPage: false });
await setFlag("ai_off", false);

// 3. Runs paused.
await setFlag("runs_off", true);
await submit(CAL);
expect("runs_off shows paused message", await page.getByRole("alert").filter({ hasText: "New orders are paused" }).isVisible());
await setFlag("runs_off", false);

// 4. Quota (server started with CAFAI_RUNS_PER_HOUR=3). Counted so far: runs 1 and 2 (the paused attempt is refused
//    before counting). Run 3 is allowed; the next one is refused.
await submit(CAL);
expect("third run within the cap is allowed", /\/r\/[0-9a-f-]{36}$/.test(page.url()));
await submit(CAL);
expect("quota exceeded shows message", await page.getByRole("alert").filter({ hasText: "a lot of orders in the last hour" }).isVisible());
await page.screenshot({ path: "docs/figma-handoff/screens/11-quota-desktop.png", fullPage: false });

// 5. Honeypot: a filled hidden field never creates a run.
await owner.query("DELETE FROM quota_counters");
const before = (await owner.query("SELECT count(*)::int AS n FROM recommendation_runs")).rows[0].n;
await page.goto(`${base}/`);
await page.getByLabel("Your project").fill(CAL);
await page.locator("#website").evaluate((el) => { el.value = "spam"; });
await page.getByRole("button", { name: "What do you recommend?" }).click();
await page.waitForLoadState("networkidle");
const after = (await owner.query("SELECT count(*)::int AS n FROM recommendation_runs")).rows[0].n;
expect("honeypot submission creates no run", after === before);

// 6. Ledger and audit.
const audit = (await owner.query("SELECT count(*)::int AS n FROM audit_events WHERE kind LIKE 'flag_%'")).rows[0].n;
expect("flag changes audited", audit >= 6);
await browser.close();
await owner.end();
console.log(checks.join("\n"));
process.exit(checks.some((c) => c.startsWith("FAIL")) ? 1 : 0);
