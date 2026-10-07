import { cpSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { loadCatalog } from "./load";

const ROOT = fileURLToPath(new URL("../../catalog", import.meta.url));

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
    const res = loadCatalog({ root: dir });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.errors.some((e) => e.message.includes("access.access_short has 19 words; the card allows 14"))).toBe(true);
      expect(res.errors.some((e) => e.message.includes("identity.vendor_short is required"))).toBe(true);
    }
  });

  it("rejects Reviewed trust without vendor-official or namespace verification", () => {
    const dir = copyCatalog();
    edit(join(dir, "fixtures/offerings/fx-payments.yaml"), "vendor_official: true\n  namespace_verified: true", "vendor_official: false\n  namespace_verified: false");
    const res = loadCatalog({ root: dir, fixtures: true });
    expect(res.ok).toBe(false);
  });
});
