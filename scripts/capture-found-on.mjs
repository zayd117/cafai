// Takes the "Found on" pictures (UX_DECISIONS §11): the top of each real tool's found_on page, as a computer sees it
// (1280x800 window, saved at 640x400) and as a phone sees it (iPhone 13, top 390x360 at 2x, saved at 780x720).
// Usage: CHROMIUM_PATH=... node scripts/capture-found-on.mjs [offering-id ...]
// Writes public/found-on/<id>.jpg and <id>-phone.jpg and sets found_on.snapshot_on to today, only when both pictures
// worked. A robot check, an error status, a timeout or a move to another site keeps the old pictures and date, so a
// card never claims a picture it does not have. Look at every new picture before committing it: banners and cookie
// walls get captured too. Needs the open web (this repo's GitHub Actions runners have it).
import { chromium, devices } from "playwright-core";
import { readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";

const only = new Set(process.argv.slice(2));
const dir = "catalog/offerings";
const out = "public/found-on";
const today = new Date().toISOString().slice(0, 10);
const ROBOT = /just a moment|attention required|verify (that )?you are (a )?human|access denied|captcha/i;
const site = (u) => new URL(u).hostname.split(".").slice(-2).join(".");

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium", args: ["--no-sandbox"] });
const computer = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 0.5, locale: "en-US" });
const phone = await browser.newContext({ ...devices["iPhone 13"], viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale: "en-US" });

/** One picture into a temporary file; returns why it failed, or null. */
async function shoot(ctx, url, file, clip) {
  const page = await ctx.newPage();
  try {
    const res = await page.goto(url, { waitUntil: "load", timeout: 30000 });
    await page.waitForTimeout(1500);
    const status = res?.status() ?? 0;
    const title = await page.title();
    if (status >= 400) return `status ${status}`;
    if (ROBOT.test(title)) return `robot check ("${title}")`;
    if (site(page.url()) !== site(url)) return `moved to another site (${page.url()})`;
    if (page.url().replace(/[#?].*$/, "").replace(/\/$/, "") !== url.replace(/[#?].*$/, "").replace(/\/$/, "")) {
      console.log(`  note: ${url} now lands on ${page.url()}; update found_on.url and the facts that cite it`);
    }
    await page.screenshot({ path: file, type: "jpeg", quality: 70, clip });
    return null;
  } catch (e) {
    return String(e).split("\n")[0].slice(0, 160);
  } finally {
    await page.close();
  }
}

let failed = 0;
for (const f of readdirSync(dir).filter((x) => x.endsWith(".yaml")).sort()) {
  const path = join(dir, f);
  const text = readFileSync(path, "utf8");
  const o = parse(text);
  if (!o.found_on || (only.size && !only.has(o.id))) continue;
  const [desk, mob] = [join(out, `${o.id}.jpg`), join(out, `${o.id}-phone.jpg`)];
  const why = (await shoot(computer, o.found_on.url, `${desk}.new`)) ?? (await shoot(phone, o.found_on.url, `${mob}.new`, { x: 0, y: 0, width: 390, height: 360 }));
  if (why) {
    failed++;
    rmSync(`${desk}.new`, { force: true });
    rmSync(`${mob}.new`, { force: true });
    console.log(`KEPT ${o.id}: ${why}; pictures stay from ${o.found_on.snapshot_on ?? "never"}`);
    continue;
  }
  renameSync(`${desk}.new`, desk);
  renameSync(`${mob}.new`, mob);
  const block = /^found_on:\n(?: {2}.*\n)*/m;
  const updated = text.replace(block, (b) => (/^ {2}snapshot_on: .*$/m.test(b) ? b.replace(/^ {2}snapshot_on: .*$/m, `  snapshot_on: ${today}`) : `${b}  snapshot_on: ${today}\n`));
  writeFileSync(path, updated);
  console.log(`NEW  ${o.id}: ${statSync(desk).size} + ${statSync(mob).size} bytes, snapshot_on ${today}`);
}
await browser.close();
// Pictures over the 100 KB budget fail the catalog tests: recompress them (for example at JPEG quality 55).
process.exit(failed ? 1 : 0);
