import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";
import type { ErrorObject, ValidateFunction } from "ajv";
import { createAjv } from "../lib/ajv";
import type { Capability, CatalogIssue, CatalogSnapshot, ClientRecord, LoadResult, Offering } from "./types";

export interface LoadOptions {
  /** Catalog root: contains schema/, clients.yaml, taxonomy.yaml, offerings/, fixtures/. */
  root: string;
  /** Load root/fixtures instead of the real catalog. Fixture records must carry fixture: true; real ones must not. */
  fixtures?: boolean;
}

const ALLOWED_ANY_CLIENT_METHODS = ["package_manager", "manual_steps", "signup"];

function readYaml(path: string, issues: CatalogIssue[]): unknown {
  try {
    return parse(readFileSync(path, "utf8"));
  } catch (e) {
    issues.push({ file: path, message: `cannot read or parse YAML: ${(e as Error).message}` });
    return undefined;
  }
}

function fmt(errors: ErrorObject[] | null | undefined): string[] {
  return (errors ?? []).map((e) => `${e.instancePath || "/"} ${e.message ?? "invalid"}${e.params ? " " + JSON.stringify(e.params) : ""}`);
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value as object)
        .sort()
        .map((k) => [k, canonicalize((value as Record<string, unknown>)[k])]),
    );
  }
  return value;
}

export function snapshotVersion(parts: unknown): string {
  return "sha256-" + createHash("sha256").update(JSON.stringify(canonicalize(parts))).digest("hex");
}

export function loadCatalog(opts: LoadOptions): LoadResult {
  const issues: CatalogIssue[] = [];
  const mode = opts.fixtures ? "fixture" : "real";
  const dataDir = opts.fixtures ? join(opts.root, "fixtures") : opts.root;

  const ajv = createAjv();
  const compile = (name: string): ValidateFunction =>
    ajv.compile(JSON.parse(readFileSync(join(opts.root, "schema", name), "utf8")));
  const vClients = compile("clients.schema.json");
  const vTaxonomy = compile("taxonomy.schema.json");
  const vOffering = compile("offering.schema.json");

  const clientsFile = join(opts.root, "clients.yaml");
  const clients = (readYaml(clientsFile, issues) ?? []) as ClientRecord[];
  if (!vClients(clients)) fmt(vClients.errors).forEach((m) => issues.push({ file: clientsFile, message: m }));

  const taxonomyFile = join(dataDir, "taxonomy.yaml");
  const taxonomy = (existsSync(taxonomyFile) ? readYaml(taxonomyFile, issues) ?? [] : []) as Capability[];
  if (!vTaxonomy(taxonomy)) fmt(vTaxonomy.errors).forEach((m) => issues.push({ file: taxonomyFile, message: m }));

  const offeringsDir = join(dataDir, "offerings");
  const offerings: Offering[] = [];
  const offeringFiles = existsSync(offeringsDir) ? readdirSync(offeringsDir).filter((f) => f.endsWith(".yaml")).sort() : [];
  for (const f of offeringFiles) {
    const file = join(offeringsDir, f);
    const doc = readYaml(file, issues);
    if (doc === undefined) continue;
    if (!vOffering(doc)) {
      fmt(vOffering.errors).forEach((m) => issues.push({ file, message: m }));
      continue;
    }
    const o = doc as Offering;
    if (f !== `${o.id}.yaml`) issues.push({ file, message: `file name must be ${o.id}.yaml` });
    offerings.push(o);
  }

  // Referential and policy integrity. Only reached meaningfully when the shapes above are valid.
  const dupes = (ids: string[]) => ids.filter((id, i) => ids.indexOf(id) !== i);
  const tax = Array.isArray(taxonomy) ? taxonomy : [];
  const capIds = new Set(tax.map((c) => c.id));
  const clientById = new Map((Array.isArray(clients) ? clients : []).map((c) => [c.id, c]));
  for (const id of dupes(offerings.map((o) => o.id))) issues.push({ file: offeringsDir, message: `duplicate offering id ${id}` });
  for (const id of dupes(tax.map((c) => c.id))) issues.push({ file: taxonomyFile, message: `duplicate capability id ${id}` });
  for (const id of dupes((Array.isArray(clients) ? clients : []).map((c) => c.id))) issues.push({ file: clientsFile, message: `duplicate client id ${id}` });

  for (const c of tax) {
    for (const n of c.native_coverage ?? []) {
      if (!clientById.has(n.client)) issues.push({ file: taxonomyFile, message: `${c.id}: unknown client "${n.client}" in native_coverage` });
    }
  }

  for (const o of offerings) {
    const file = join(offeringsDir, `${o.id}.yaml`);
    for (const cap of o.capabilities) {
      if (!capIds.has(cap)) issues.push({ file, message: `unknown capability "${cap}"` });
    }
    for (const d of o.distributions) {
      if (d.client === "any") {
        if (!ALLOWED_ANY_CLIENT_METHODS.includes(d.method)) issues.push({ file, message: `client "any" only allows ${ALLOWED_ANY_CLIENT_METHODS.join(", ")}, got ${d.method}` });
        continue;
      }
      const c = clientById.get(d.client);
      if (!c) issues.push({ file, message: `unknown client "${d.client}"` });
      else if (!c.install_methods.includes(d.method)) issues.push({ file, message: `client ${d.client} has no install method ${d.method}` });
    }
    // Plan §11: Reviewed = curator-checked, vendor-official or namespace-verified.
    if (o.trust.state === "reviewed" && !(o.trust.vendor_official || o.trust.namespace_verified)) {
      issues.push({ file, message: "trust.state reviewed requires vendor_official or namespace_verified (plan §11)" });
    }
  }

  // Fixture separation: sample data must never pass as real.
  const records: { file: string; id: string; fixture?: boolean }[] = [
    ...tax.map((c) => ({ file: taxonomyFile, id: c.id, fixture: c.fixture })),
    ...offerings.map((o) => ({ file: join(offeringsDir, `${o.id}.yaml`), id: o.id, fixture: o.fixture })),
  ];
  for (const r of records) {
    if (mode === "real" && r.fixture) issues.push({ file: r.file, message: `${r.id}: fixture records are not allowed in the real catalog` });
    if (mode === "fixture" && !r.fixture) issues.push({ file: r.file, message: `${r.id}: fixture catalog records must set fixture: true` });
  }

  if (issues.length) return { ok: false, errors: issues };
  const snapshot: CatalogSnapshot = {
    version: snapshotVersion({ mode, clients, taxonomy, offerings }),
    mode,
    clients,
    taxonomy,
    offerings,
  };
  return { ok: true, snapshot };
}
