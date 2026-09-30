// Accessibility checks (plan §18: WCAG 2.2 AA, keyboard use, visible focus, labelled controls, never colour alone).
// Usage: node scripts/a11y.mjs <baseUrl>. Fails on any serious or critical axe violation or a keyboard trap.
import { chromium } from "playwright-core";
import AxeBuilder from "@axe-core/playwright";

const base = process.argv[2] ?? "http://localhost:3100";
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--no-sandbox"] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await ctx.newPage();
const results = [];
let failed = false;

async function scan(name) {
  // Open every disclosure so hidden levels are scanned too.
  await page.evaluate(() => document.querySelectorAll("details").forEach((d) => (d.open = true)));
  const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
  const bad = r.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  const minor = r.violations.filter((v) => !bad.includes(v));
  results.push(`${bad.length ? "FAIL" : "PASS"} axe ${name}: ${bad.length} serious/critical, ${minor.length} minor/moderate`);
  for (const v of r.violations) results.push(`    [${v.impact}] ${v.id}: ${v.help} (${v.nodes.length}) e.g. ${v.nodes[0]?.target.join(" ")}`);
  if (bad.length) failed = true;
}

await page.goto(`${base}/`, { waitUntil: "networkidle" });
await scan("counter");

// Keyboard only: Tab from the top reaches the textarea, an AI-tool chip and the submit button, with a visible focus ring.
const seen = [];
for (let i = 0; i < 12; i++) {
  await page.keyboard.press("Tab");
  seen.push(await page.evaluate(() => {
    const el = document.activeElement;
    const cs = el ? getComputedStyle(el.matches("input.sr-only, .chip input") ? el.nextElementSibling ?? el : el) : null;
    return { tag: el?.tagName, id: el?.id, name: el?.getAttribute("name"), text: el?.textContent?.trim().slice(0, 30), outline: cs?.outlineStyle };
  }));
}
const reach = (pred) => seen.some(pred);
const kb = reach((e) => e.id === "text") && reach((e) => e.name === "clients") && reach((e) => e.text === "What do you recommend?");
results.push(`${kb ? "PASS" : "FAIL"} keyboard reaches description, AI-tool chip and submit in 12 tabs`);
if (!kb) { failed = true; results.push("    order: " + seen.map((e) => e.id || e.name || e.text || e.tag).join(" → ")); }
const ringed = seen.filter((e) => e.outline && e.outline !== "none").length;
results.push(`${ringed === seen.length ? "PASS" : "FAIL"} visible focus ring on every focused control (${ringed}/${seen.length})`);
if (ringed !== seen.length) failed = true;

// Keyboard submit of an example, then scan results and setup.
await page.getByRole("button", { name: /calorie and macro tracker/ }).focus();
await page.keyboard.press("Enter");
await page.waitForURL(/\/r\/[0-9a-f-]{36}$/);
await page.waitForLoadState("networkidle");
await scan("results (all levels open)");
await page.getByRole("button", { name: /^Set up in/ }).focus();
await page.keyboard.press("Enter");
await page.waitForURL(/\/setup/);
await page.waitForLoadState("networkidle");
await scan("setup");

await page.goto(`${base}/privacy`, { waitUntil: "networkidle" });
await scan("legal placeholder");

await browser.close();
console.log(results.join("\n"));
process.exit(failed ? 1 : 0);
