// Browser verification helper (native Chromium). Usage:
//   node scripts/shot.mjs <url> <out.png> [--width 1280] [--height 800] [--full]
// Prints HTTP status, console errors/warnings and failed requests; exits 1 on any console error or failed request.
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

const [url, out, ...rest] = process.argv.slice(2);
if (!url || !out) {
  console.error("usage: node scripts/shot.mjs <url> <out.png> [--width N] [--height N] [--full]");
  process.exit(2);
}
const opt = (name, fallback) => {
  const i = rest.indexOf(`--${name}`);
  return i >= 0 ? Number(rest[i + 1]) : fallback;
};
const executablePath = process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium";

const browser = await chromium.launch({ executablePath, args: ["--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: opt("width", 1280), height: opt("height", 800) } });
const problems = [];
page.on("console", (m) => {
  if (m.type() === "error" || m.type() === "warning") problems.push(`console.${m.type()}: ${m.text()}`);
});
page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));
page.on("requestfailed", (r) => problems.push(`requestfailed: ${r.url()} ${r.failure()?.errorText}`));
page.on("response", (r) => {
  if (r.status() >= 400) problems.push(`http ${r.status()}: ${r.url()}`);
});

const res = await page.goto(url, { waitUntil: "networkidle" });
console.log(`status ${res?.status()} title "${await page.title()}"`);
mkdirSync(dirname(out), { recursive: true });
await page.screenshot({ path: out, fullPage: rest.includes("--full") });
await browser.close();

console.log(problems.length ? problems.join("\n") : "no console errors or failed requests");
process.exit(problems.length ? 1 : 0);
