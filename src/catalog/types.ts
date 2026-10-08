// Hand-written mirror of catalog/schema/*.json (source of truth is the JSON Schema; a test loads fixtures through both).

export type OfferingKind = "mcp_server" | "skill" | "plugin" | "api" | "library" | "play";
export type TrustState = "reviewed" | "checked" | "unmatched" | "flagged" | "revoked";
export type EvidenceTag = "claimed" | "observed" | "inferred";
export type CompatibilityLevel = "tested" | "reported" | "derived" | "declared";
export type NeedType = "implied" | "latent";
export type InstallMethod =
  | "cli_command"
  | "deeplink"
  | "connector"
  | "plugin_marketplace"
  | "config_file"
  | "package_manager"
  | "manual_steps"
  | "signup";

export interface Fact {
  text: string;
  evidence: EvidenceTag;
  source_url: string;
  as_of: string;
}

export interface NeedSignal {
  text: string;
  need_type: NeedType;
}

export interface Distribution {
  client: string; // client id or "any"
  method: InstallMethod;
  command?: string;
  link?: string;
  url?: string;
  steps?: string[];
  version_pin?: string;
  compatibility: CompatibilityLevel;
  verified_on: string;
  source_url: string;
}

export interface Offering {
  id: string;
  fixture?: boolean;
  kind: OfferingKind;
  identity: {
    display_name: string;
    vendor: string;
    /** Facts-line maker name; required by the loader when vendor is longer than 24 characters. */
    vendor_short?: string;
    technical_name?: string;
    registry_namespace?: string;
    package_id?: string;
    repo_url?: string;
  };
  capabilities: string[];
  need_signals: NeedSignal[];
  skip_if: string[];
  resource_profile: { provides: Fact[]; requires: Fact[]; supports: Fact[]; limits: Fact[] };
  distributions: Distribution[];
  access: {
    auth: "oauth" | "api_key" | "none";
    credential_needed?: string;
    scopes?: string[];
    read_write: "read_only" | "read_write" | "not_applicable";
    data_touched?: string[];
    access_plain: string;
    effort_plain: string;
    // Card fields added 2026-10-07. Required by the schema; optional here because runs saved before then keep catalog
    // snapshots without them, and the card falls back to the longer fields.
    access_short?: string;
    effort_short?: string;
    first_step?: string;
    least_privilege_steps?: string[];
  };
  runtime: { location: "local" | "remote" | "not_applicable"; os?: string[]; requires?: string[] };
  /** label: required by the schema, optional for snapshots saved before 2026-10-07 (see access above). */
  cost: { model: "free" | "paid" | "usage_based"; label?: string; plan_required?: string; source_url: string; as_of: string };
  trust: {
    state: TrustState;
    vendor_official: boolean;
    namespace_verified: boolean;
    notes?: string;
    third_party_grade?: { provider: string; grade: string; as_of: string };
  };
  editorial: { what_it_is: string; could_help_with: string; first_prompt: string; reviewer: string; reviewed_on: string };
  /** The card's "Found on" link, added 2026-10-08. snapshot_on: the day of the pictures in public/found-on/. */
  found_on?: { url: string; label: string; snapshot_on?: string };
  last_verified_on: string;
}

export interface Capability {
  id: string;
  fixture?: boolean;
  plain_name: string;
  job_phrases: string[];
  need_signals: NeedSignal[];
  skip_conditions: string[];
  native_coverage: { client: string; note: string }[];
}

export interface ClientRecord {
  id: string;
  name: string;
  install_methods: InstallMethod[];
  handoff: string[];
  plan_limits?: string[];
  native_capabilities?: string[];
  source: string;
  verified_on: string;
}

export interface CatalogSnapshot {
  /** sha256 of canonical content; stored on every run so results can be replayed (plan §11). */
  version: string;
  mode: "real" | "fixture";
  clients: ClientRecord[];
  taxonomy: Capability[];
  offerings: Offering[];
}

export interface CatalogIssue {
  file: string;
  message: string;
}

export type LoadResult = { ok: true; snapshot: CatalogSnapshot } | { ok: false; errors: CatalogIssue[] };
