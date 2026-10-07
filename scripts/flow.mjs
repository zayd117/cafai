// End-to-end browser check of the core flow in native Chromium (build rule: verify behaviour, not just compile).
// Usage: node scripts/flow.mjs <baseUrl> <outDir>
// Exits 1 on any console error, page error, failed request or HTTP >= 400, or a failed expectation.
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";

const [base = "http://localhost:3100", out = "docs/figma-handoff/screens"] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium", args: ["--no-sandbox"] });
const problems = [];
const notes = [];
const checks = [];
const expect = (name, ok) => checks.push(`${ok ? "PASS" : "FAIL"} ${name}`);

async function newPage(width, height) {
  const page = await browser.newPage({ viewport: { width, height } });
  page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") problems.push(`console.${m.type()}: ${m.text()}`); });
  page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));
  page.on("requestfailed", (r) => {
    const line = `requestfailed: ${r.url()} ${r.failure()?.errorText} (${r.resourceType()}, navigation=${r.isNavigationRequest()})`;
    // Next.js background fetches cancelled because the test navigated away are not app failures; keep them as notes.
    if (r.failure()?.errorText === "net::ERR_ABORTED" && r.resourceType() === "fetch" && r.url().startsWith(base)) notes.push(line);
    else problems.push(line);
  });
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

  // Journey D typed in (scripted MOCK answer in sample mode). The example button gives the saved answer, checked below.
  await page.getByLabel("Your project").fill("I'm making a calorie and macro tracker app for phones. I use Claude Code. I don't really know what I need.");
  await page.getByRole("button", { name: "What do you recommend?" }).click();
  await page.waitForURL(/\/r\/[0-9a-f-]{36}$/);
  await page.waitForLoadState("networkidle");
  const picks = await page.locator("article.card").count();
  expect(`${label}: 1 to 5 pick cards (got ${picks})`, picks >= 1 && picks <= 5);
  expect(`${label}: at most one Also worth knowing`, (await page.locator("article.card.awk").count()) <= 1);
  // Level 1 is what shows before any drop-down opens (closed <details> content is not rendered, so innerText skips it).
  const level1 = await page.locator("article.card").evaluateAll((cards) => cards.map((c) => c.innerText).join(" "));
  expect(`${label}: no MCP/OAuth/API/SDK words at level 1`, !/\b(MCP|OAuth|APIs?|SDKs?|stdio)\b/.test(level1));
  expect(`${label}: every card leads with Add now / Add later / Not sure`, (await page.locator("article.card .pill").count()) === picks
    && (await page.locator("article.card .pill").allTextContents()).every((t) => /^(Add now|Add later|Not sure)$/.test(t.trim())));
  expect(`${label}: facts line and It can see line on every card`, (await page.locator("article.card .facts").count()) === picks
    && (await page.locator("article.card .lines dt", { hasText: "It can see" }).count()) === picks);
  const later = page.locator("article.card:has(.pill.later)");
  for (let i = 0; i < await later.count(); i++) {
    expect(`${label}: Add later card starts folded and out of the order`, (await later.nth(i).locator(".why-fold:not([open])").count()) === 1
      && !(await later.nth(i).locator('input[name="pick"]').isChecked()));
  }
  const hScroll2 = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(`${label}: no horizontal scroll on results`, !hScroll2);
  await page.screenshot({ path: `${out}/02-results-${label}.png`, fullPage: true });

  // Level 2 (setup steps, More details with Match and Confidence) and level 3 open.
  const first = page.locator("article.card").first();
  await first.getByText("How to set it up").click();
  expect(`${label}: setup steps with the first prompt ready to copy`, (await first.locator(".steps > li").count()) >= 2 && await first.getByRole("button", { name: "Copy" }).isVisible());
  await first.getByText("More details").click();
  expect(`${label}: Match and Confidence words under More details`, /(Strong|Good) match/.test(await first.locator(".fit-signals").innerText()) && /(Sure|Fairly sure|Not sure yet)/.test(await first.locator(".fit-signals").innerText()));
  await first.getByText("Technical details").click();
  expect(`${label}: level 3 shows offering type`, await first.getByText("Offering type").isVisible());
  await first.screenshot({ path: `${out}/03-card-levels-${label}.png` });

  // Should-haves: alternatives inside level 2, and "How we understood this".
  const withAlt = page.locator("article.card").filter({ hasText: "Sample app database access" });
  await withAlt.getByText("More details").click();
  await withAlt.getByText(/Show alternatives/).click();
  expect(`${label}: alternatives listed`, await withAlt.getByText("Sample hosted database helper").isVisible());
  await page.getByText("How we understood this").click();
  expect(`${label}: unmapped concept shown as a gap`, await page.getByText("barcode scanning: not on our menu yet").isVisible());
  if (label === "desktop") await withAlt.screenshot({ path: `${out}/12-alternatives-${label}.png` });

  // Card feedback round-trip.
  await first.getByRole("button", { name: "Useful", exact: true }).click();
  await page.waitForURL(/thanks=useful/);
  expect(`${label}: feedback acknowledged`, await page.getByRole("status").filter({ hasText: "Thanks, noted." }).isVisible());

  // Setup handoff (board 7): order form → setup, client tabs, decoded Cursor config, warnings, feedback.
  const resultsUrl = page.url().replace(/[?#].*$/, "");
  await page.getByRole("button", { name: /^Set up in/ }).click();
  await page.waitForURL(/\/setup\?/);
  await page.waitForLoadState("networkidle");
  expect(`${label}: setup heading`, await page.getByRole("heading", { name: "Your order is ready" }).isVisible());
  expect(`${label}: setup has only ticked picks (3 direct)`, (await page.locator("section.card[id^=pick-]").count()) === 3);
  const msg = await page.locator("#paste-message").textContent();
  expect(`${label}: paste message asks before each step`, !!msg?.includes("Ask me before each step"));
  expect(`${label}: least-privilege warning shown`, await page.getByText("Use a development project and read-only access.").first().isVisible());
  await page.getByRole("button", { name: "Copy message" }).click();
  expect(`${label}: copy button responds (client JS runs under CSP)`, await page.getByRole("button", { name: /Copied|Selected/ }).waitFor({ timeout: 5000 }).then(() => true, () => false));
  await page.screenshot({ path: `${out}/07-setup-claude-code-${label}.png`, fullPage: true });
  await page.getByRole("link", { name: "Cursor" }).click();
  await page.waitForURL(/client=cursor/);
  expect(`${label}: Cursor config decoded before link`, await page.getByText('"url": "https://mcp.example.com/sample"').first().isVisible());
  await page.screenshot({ path: `${out}/08-setup-cursor-${label}.png`, fullPage: true });
  await page.getByRole("button", { name: "It worked" }).first().click();
  await page.waitForURL(/thanks=it_worked/);
  expect(`${label}: setup feedback acknowledged`, await page.getByRole("status").filter({ hasText: "Thanks for telling us" }).isVisible());

  // Not needed now and unknown run.
  if (label === "desktop") {
    await page.goto(resultsUrl, { waitUntil: "networkidle" });
    // T-07: read-back edits are ground truth and redo the picks as a new run (plan §9). The read-back is tags:
    // tapping one shows where it came from and lets the person reword it; × removes it.
    await page.getByText("Change this").click();
    await page.locator(".tags .tag-t").last().click();
    expect("T-07 tapping a tag highlights the words it came from", await page.locator(".said mark").isVisible());
    await page.locator("#tag-own").fill("Claude Code on a laptop");
    await page.getByRole("button", { name: "Save" }).click();
    await page.getByRole("button", { name: "Update my picks" }).click();
    await page.waitForURL((u) => /\/r\/[0-9a-f-]{36}$/.test(u.pathname) && u.href.replace(/[?#].*$/, "") !== resultsUrl);
    await page.waitForLoadState("networkidle");
    await page.getByText("Change this").click();
    const tagsOf = () => page.locator(".tags .tag-t").allTextContents();
    expect("T-07 edit reruns as a new run keeping the user's words", (await tagsOf()).includes("Claude Code on a laptop"));
    expect("T-07 picks still shown after a tag edit", (await page.locator("article.card").count()) >= 1);
    // T-08: refine filters rerun and stay ticked, and keep the read-back edits.
    await page.getByLabel("Free only").check().catch(async (e) => {
      await page.screenshot({ path: `${out}/_debug-refine.png`, fullPage: true });
      throw e;
    });
    await page.getByRole("button", { name: "Update picks" }).click();
    await page.waitForLoadState("networkidle");
    expect("T-08 refine keeps the filter ticked", await page.getByLabel("Free only").isChecked());
    await page.getByText("Change this").click();
    expect("T-08 refine keeps the read-back edits", (await tagsOf()).includes("Claude Code on a laptop"));
    // T-07b: × removes a tag (with Undo), and a sentence added in the read-back becomes new tags.
    const gone = (await tagsOf())[0];
    await page.getByRole("button", { name: `Remove ${gone}` }).click();
    expect("T-07b removing a tag offers Undo", await page.getByRole("button", { name: "Undo" }).isVisible());
    // T-07b: a sentence added in the read-back becomes new tags.
    await page.getByLabel("Add something we missed").fill("I test the signup flow by hand.");
    await page.getByRole("button", { name: "Add", exact: true }).click();
    await page.waitForURL((u) => /\/r\/[0-9a-f-]{36}$/.test(u.pathname));
    await page.waitForLoadState("networkidle");
    await page.getByText("Change this").click();
    expect("T-07b an added sentence shows as a new tag", (await page.locator(".tags .tag.new").count()) >= 1);
    expect("T-07b a removed tag stays removed", !(await tagsOf()).includes(gone));
    await page.goto(resultsUrl, { waitUntil: "networkidle" });
    await page.getByText(/Not needed now/).click();
    await page.screenshot({ path: `${out}/04-not-needed-${label}.png`, fullPage: false });
    const miss = await page.goto(`${base}/r/00000000-0000-4000-8000-000000000000`);
    expect("unknown run returns 404 page", miss?.status() === 404 && (await page.getByText("We can't find that order.").isVisible()));
    // The expected 404 above; over HTTP/2 (Vercel) the browser logs it as "404 ()" with no reason phrase.
    problems.splice(0, problems.length, ...problems.filter((p) => !p.includes("00000000-0000-4000-8000-000000000000") && !/404 \((Not Found)?\)/.test(p)));
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
  // The three example buttons answer from their saved answers: real tools, their own note instead of the sample one.
  for (const [chip, cards, name] of [["Calorie tracker app", 4, /Expo/], ["Excel change alerts", 3, /phone/], ["Weekly Shopify report", 3, /Shopify/]]) {
    await page.goto(`${base}/`, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: new RegExp(`^${chip}:`) }).click();
    await page.waitForURL(/\/r\/[0-9a-f-]{36}$/);
    await page.waitForLoadState("networkidle");
    const tag = `${label}: ${chip} example`;
    expect(`${tag} shows the saved-example note, not the sample one`,
      (await page.getByRole("complementary", { name: "Saved example" }).isVisible()) && !(await page.getByText("Nothing here is a real recommendation.").isVisible()));
    const n = await page.locator("article.card").count();
    expect(`${tag} has ${cards} real picks (got ${n})`, n === cards && (await page.locator("article.card h2, article.card h3").filter({ hasText: name }).count()) > 0);
    expect(`${tag} has no horizontal scroll`, !(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)));
    if (label === "desktop") await page.screenshot({ path: `${out}/13-saved-example-${chip.toLowerCase().replace(/\W+/g, "-")}-${label}.png`, fullPage: true });
    if (chip === "Calorie tracker app") {
      await page.getByRole("button", { name: /^Set up in/ }).click();
      await page.waitForURL(/\/setup\?/);
      expect(`${tag} setup keeps the saved-example note`, await page.getByRole("complementary", { name: "Saved example" }).isVisible());
    }
  }
  await page.close();
}
await browser.close();
console.log(checks.join("\n"));
console.log(problems.length ? "PROBLEMS:\n" + problems.join("\n") : "no console errors, failed requests or HTTP errors");
if (notes.length) console.log(`notes: ${notes.length} background fetch(es) cancelled by test navigation`);
process.exit(problems.length || checks.some((c) => c.startsWith("FAIL")) ? 1 : 0);
