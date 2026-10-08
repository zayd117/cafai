// Accessibility checks (plan §18: WCAG 2.2 AA, keyboard use, visible focus, labelled controls, never colour alone).
// Usage: node scripts/a11y.mjs <baseUrl>. Fails on any serious or critical axe violation or a keyboard trap.
import { chromium } from "playwright-core";
import AxeBuilder from "@axe-core/playwright";

const base = process.argv[2] ?? "http://localhost:3100";
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium", args: ["--no-sandbox"] });
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

// "Found on" from the keyboard: Tab onto the link opens its picture after a short wait; Esc closes it and keeps focus.
const card = page.locator("article.card").first();
await card.locator('input[name="pick"]').focus();
await page.keyboard.press("Tab");
await page.waitForTimeout(700);
const opened = await card.locator(".found-link").evaluate((a) => a === document.activeElement) && await card.locator(".found-pop").isVisible();
await scan("results (Found on picture open)");
await page.keyboard.press("Escape");
const closed = !(await card.locator(".found-pop").isVisible()) && await card.locator(".found-link").evaluate((a) => a === document.activeElement);
await page.keyboard.press("Tab");
await page.keyboard.press("Enter");
const button = await card.getByRole("button", { name: "Preview" }).getAttribute("aria-expanded") === "true";
await page.keyboard.press("Escape");
const kbFound = opened && closed && button;
results.push(`${kbFound ? "PASS" : "FAIL"} keyboard opens the Found on picture (Tab to link, or Preview + Enter), Esc closes it and keeps focus`);
if (!kbFound) { failed = true; results.push(`    opened ${opened}, closed ${closed}, button ${button}`); }
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
