// End-to-end browser check of the core flow in native Chromium (build rule: verify behaviour, not just compile).
// Usage: node scripts/flow.mjs <baseUrl> <outDir>
// Exits 1 on any console error, page error, failed request or HTTP >= 400, or a failed expectation.
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";

const [base = "http://localhost:3100", out = "docs/figma-handoff/screens"] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium", args: ["--no-sandbox"] });
const problems = [];
const checks = [];
const expect = (name, ok) => checks.push(`${ok ? "PASS" : "FAIL"} ${name}`);

async function newPage(width, height) {
  const page = await browser.newPage({ viewport: { width, height } });
  page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") problems.push(`console.${m.type()}: ${m.text()}`); });
  page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));
  page.on("requestfailed", (r) => problems.push(`requestfailed: ${r.url()} ${r.failure()?.errorText}`));
  page.on("response", (r) => { if (r.status() >= 400) problems.push(`http ${r.status()}: ${r.url()}`); });
  return page;
}

for (const [label, width, height] of [["desktop", 1440, 1000], ["mobile", 390, 844]]) {
  const page = await newPage(width, height);
  await page.goto(`${base}/`, { waitUntil: "networkidle" });
  expect(`${label}: counter heading`, (await page.getByRole("heading", { level: 1 }).textContent())?.includes("What are you working on?"));
  expect(`${label}: sample-mode banner shown`, await page.getByText("Nothing here is a real recommendation.").isVisible());
  const csp = (await page.request.get(`${base}/`)).headers()["content-security-policy"] ?? "";
  expect(`${label}: strict CSP header`, csp.includes("script-src 'self' 'nonce-") && !csp.includes("unsafe-inline"));
  const hScroll = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(`${label}: no horizontal scroll on counter`, !hScroll);
  await page.screenshot({ path: `${out}/01-counter-${label}.png`, fullPage: true });

  // Empty submit is rejected with a message.
  await page.getByRole("button", { name: "What do you recommend?" }).click();
  await page.waitForURL(/error=empty/);
  expect(`${label}: empty input error`, await page.getByRole("alert").filter({ hasText: "Describe what you are working on" }).isVisible());

  // Journey D example (scripted MOCK answer in sample mode).
  await page.getByRole("button", { name: /calorie and macro tracker/ }).click();
  await page.waitForURL(/\/r\/[0-9a-f-]{36}$/);
  await page.waitForLoadState("networkidle");
  const picks = await page.locator("article.card").count();
  expect(`${label}: 1 to 5 pick cards (got ${picks})`, picks >= 1 && picks <= 5);
  expect(`${label}: at most one Also worth knowing`, (await page.locator("article.card.awk").count()) <= 1);
  const level1 = await page.locator("article.card").evaluateAll((cards) =>
    cards.map((c) => [...c.children].filter((el) => el.tagName !== "DETAILS").map((el) => el.textContent).join(" ")).join(" "));
  expect(`${label}: no MCP/OAuth/API/SDK words at level 1`, !/\b(MCP|OAuth|APIs?|SDKs?|stdio)\b/.test(level1));
  expect(`${label}: Match and Confidence words present`, /(Strong|Good) match/.test(level1) && /(Sure|Fairly sure|Not sure yet)/.test(level1));
  const hScroll2 = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(`${label}: no horizontal scroll on results`, !hScroll2);
  await page.screenshot({ path: `${out}/02-results-${label}.png`, fullPage: true });

  // Level 2 and 3 open.
  const first = page.locator("article.card").first();
  await first.getByText("How it fits and how to set it up").click();
  await first.getByText("Technical details").click();
  expect(`${label}: level 3 shows offering type`, await first.getByText("Offering type").isVisible());
  await first.screenshot({ path: `${out}/03-card-levels-${label}.png` });

  // Card feedback round-trip.
  await first.getByRole("button", { name: "Useful", exact: true }).click();
  await page.waitForURL(/thanks=useful/);
  expect(`${label}: feedback acknowledged`, await page.getByRole("status").filter({ hasText: "Thanks, noted." }).isVisible());

  // Not needed now and unknown run.
  if (label === "desktop") {
    await page.getByText(/Not needed now/).click();
    await page.screenshot({ path: `${out}/04-not-needed-${label}.png`, fullPage: false });
    const miss = await page.goto(`${base}/r/00000000-0000-4000-8000-000000000000`);
    expect("unknown run returns 404 page", miss?.status() === 404 && (await page.getByText("We can't find that order.").isVisible()));
    problems.splice(0, problems.length, ...problems.filter((p) => !p.includes("00000000-0000-4000-8000-000000000000") && !p.includes("404 (Not Found)")));
    // Nothing-needed and out-of-scope outcomes from fixture scripts.
    await page.goto(`${base}/`);
    await page.getByLabel("Your project").fill("I already keep a project notes file so Claude Code knows what the app is for.");
    await page.getByRole("button", { name: "What do you recommend?" }).click();
    await page.waitForURL(/\/r\//);
    expect("nothing-needed outcome", await page.getByRole("heading", { name: "You may not need anything new." }).isVisible());
    await page.screenshot({ path: `${out}/05-nothing-needed-${label}.png`, fullPage: true });
    await page.goto(`${base}/`);
    await page.getByLabel("Your project").fill("What will the weather be tomorrow in Lisbon?");
    await page.getByRole("button", { name: "What do you recommend?" }).click();
    await page.waitForURL(/\/r\//);
    expect("out-of-scope outcome", await page.getByRole("heading", { name: "That is outside what we do." }).isVisible());
    await page.screenshot({ path: `${out}/06-out-of-scope-${label}.png`, fullPage: true });
  }
  await page.close();
}
await browser.close();
console.log(checks.join("\n"));
console.log(problems.length ? "PROBLEMS:\n" + problems.join("\n") : "no console errors, failed requests or HTTP errors");
process.exit(problems.length || checks.some((c) => c.startsWith("FAIL")) ? 1 : 0);
