import { cpSync, existsSync, mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { loadCatalog } from "./load";

const ROOT = fileURLToPath(new URL("../../catalog", import.meta.url));
const PICTURES = fileURLToPath(new URL("../../public/found-on", import.meta.url));

function copyCatalog(): string {
  const dir = mkdtempSync(join(tmpdir(), "cafai-catalog-"));
  cpSync(ROOT, dir, { recursive: true });
  return dir;
}

function edit(file: string, from: string, to: string) {
  const text = readFileSync(file, "utf8");
  expect(text).toContain(from);
  writeFileSync(file, text.replace(from, to));
}

describe("loadCatalog", () => {
  it("loads the real catalog (so far only the entries behind the intake's saved examples)", () => {
    const res = loadCatalog({ root: ROOT });
    if (!res.ok) throw new Error(JSON.stringify(res.errors, null, 2));
    expect(res.snapshot.mode).toBe("real");
    expect(res.snapshot.clients.map((c) => c.id)).toEqual(["claude_code", "cursor", "claude_desktop"]);
    expect(res.snapshot.offerings.length).toBeGreaterThan(0);
    expect(res.snapshot.offerings.every((o) => !o.fixture && ["reviewed", "checked"].includes(o.trust.state))).toBe(true);
  });

  it("loads fixtures, every record marked fixture", () => {
    const res = loadCatalog({ root: ROOT, fixtures: true });
    if (!res.ok) throw new Error(JSON.stringify(res.errors, null, 2));
    expect(res.snapshot.mode).toBe("fixture");
    expect(res.snapshot.offerings.length).toBeGreaterThan(0);
    expect(res.snapshot.offerings.every((o) => o.fixture === true)).toBe(true);
    expect(res.snapshot.taxonomy.every((c) => c.fixture === true)).toBe(true);
  });

  it("produces a stable content-addressed version", () => {
    const a = loadCatalog({ root: ROOT, fixtures: true });
    const b = loadCatalog({ root: ROOT, fixtures: true });
    expect(a.ok && b.ok && a.snapshot.version === b.snapshot.version).toBe(true);
    const dir = copyCatalog();
    edit(join(dir, "fixtures/offerings/fx-notes-file.yaml"), "reviewer: fixture", "reviewer: fixture-2");
    const c = loadCatalog({ root: dir, fixtures: true });
    expect(c.ok && a.ok && c.snapshot.version !== a.snapshot.version).toBe(true);
  });

  it("rejects fixture records in the real catalog", () => {
    const dir = copyCatalog();
    cpSync(join(dir, "fixtures/offerings/fx-notes-file.yaml"), join(dir, "offerings/fx-notes-file.yaml"));
    cpSync(join(dir, "fixtures/taxonomy.yaml"), join(dir, "taxonomy.yaml"));
    const res = loadCatalog({ root: dir });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.errors.some((e) => e.message.includes("fixture records are not allowed"))).toBe(true);
  });

  it("rejects an unknown capability reference", () => {
    const dir = copyCatalog();
    edit(join(dir, "fixtures/offerings/fx-payments.yaml"), "  - payments", "  - not-a-capability");
    const res = loadCatalog({ root: dir, fixtures: true });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.errors.map((e) => e.message)).toContain('unknown capability "not-a-capability"');
  });

  it("rejects an install method the client does not support", () => {
    const dir = copyCatalog();
    edit(join(dir, "fixtures/offerings/fx-payments.yaml"), "method: cli_command", "method: deeplink");
    const res = loadCatalog({ root: dir, fixtures: true });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.errors.map((e) => e.message)).toContain("client claude_code has no install method deeplink");
  });

  it("rejects catalog links that are not https (they become hrefs on the page)", () => {
    const dir = copyCatalog();
    const file = join(dir, "fixtures/offerings/fx-payments.yaml");
    const text = readFileSync(file, "utf8");
    writeFileSync(file, text.replaceAll("source_url: https://example.com/docs", "source_url: javascript:alert(1)"));
    const res = loadCatalog({ root: dir, fixtures: true });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.errors.some((e) => e.message.includes("must start with https://, got javascript:alert(1)"))).toBe(true);
  });

  it("rejects facts without an evidence tag and unknown offering kinds", () => {
    const dir = copyCatalog();
    edit(join(dir, "fixtures/offerings/fx-payments.yaml"), "evidence: claimed", "evidence: guessed");
    edit(join(dir, "fixtures/offerings/fx-notes-file.yaml"), "kind: play", "kind: model");
    const res = loadCatalog({ root: dir, fixtures: true });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.errors.length).toBeGreaterThanOrEqual(2);
  });

  it("keeps card copy within its word limits and needs a short maker name for long ones", () => {
    const dir = copyCatalog();
    const usda = join(dir, "offerings/usda-fooddata-central.yaml");
    edit(usda, "  vendor_short: USDA\n", "");
    edit(usda, "access_short: Only public food data. Nothing of yours.", "access_short: Only public food data, nothing of yours, and nothing at all from your phone, your computer or your account.");
    edit(usda, "- You already pay for a list of foods that covers your users' countries.", "- You already pay for a list of foods that covers every country your users live in today.");
    const res = loadCatalog({ root: dir });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.errors.some((e) => e.message.includes("access.access_short has 19 words; the card allows 14"))).toBe(true);
      expect(res.errors.some((e) => e.message.includes("identity.vendor_short is required"))).toBe(true);
      expect(res.errors.some((e) => e.message.includes("skip_if[0] has 17 words; the card allows 14"))).toBe(true);
    }
  });

  it("rejects Reviewed trust without vendor-official or namespace verification", () => {
    const dir = copyCatalog();
    edit(join(dir, "fixtures/offerings/fx-payments.yaml"), "vendor_official: true\n  namespace_verified: true", "vendor_official: false\n  namespace_verified: false");
    const res = loadCatalog({ root: dir, fixtures: true });
    expect(res.ok).toBe(false);
  });

  it("gives every real tool a \"Found on\" link to a page its facts cite, in house-style words", () => {
    const res = loadCatalog({ root: ROOT });
    if (!res.ok) throw new Error(JSON.stringify(res.errors, null, 2));
    for (const o of res.snapshot.offerings) {
      expect(o.found_on, o.id).toBeDefined();
      expect(o.found_on!.label, o.id).not.toMatch(/\b(connectors?|servers?|databases?|betas?|MCPs?|stdio|OAuth|APIs?|SDKs?|JSON|CLI)\b/i);
    }
  });

  it("has both pictures for every dated \"Found on\" link, within budget, and no stray pictures", () => {
    const res = loadCatalog({ root: ROOT });
    if (!res.ok) throw new Error(JSON.stringify(res.errors, null, 2));
    const expected = res.snapshot.offerings.filter((o) => o.found_on?.snapshot_on).flatMap((o) => [`${o.id}.jpg`, `${o.id}-phone.jpg`]);
    for (const f of expected) {
      expect(existsSync(join(PICTURES, f)), f).toBe(true);
      expect(statSync(join(PICTURES, f)).size, f).toBeLessThanOrEqual(100_000);
    }
    expect(readdirSync(PICTURES).sort()).toEqual(expected.sort());
  });

  it("rejects a \"Found on\" link to a page no fact cites, or a long label", () => {
    const dir = copyCatalog();
    const shopify = join(dir, "offerings/shopify-connector.yaml");
    edit(shopify, "  url: https://help.shopify.com/en/manual/ai-powered-tools/connecting-ai-tools/shopify-connector-for-claude\n", "  url: https://example.com/somewhere-else\n");
    edit(shopify, "label: Shopify’s help page", "label: Shopify’s own help page for this");
    const res = loadCatalog({ root: dir });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.errors.some((e) => e.message.includes("found_on.url must be one of its facts' source_url, got https://example.com/somewhere-else"))).toBe(true);
      expect(res.errors.some((e) => e.message.includes("found_on.label has 6 words; the card allows 4"))).toBe(true);
    }
  });
});
