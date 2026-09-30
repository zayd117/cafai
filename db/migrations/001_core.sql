-- L2 core data layer. Sources: plan §19 (data architecture), §15 (organization), §12 (context and retention),
-- §11 (catalog snapshot per run), §14 (tenant isolation: org_id on every row, RLS as a second wall), §17 (Postgres).
-- Users, identities, memberships and sessions arrive in L7 (identity provider undecided, REGISTER A-003).

-- Catalog snapshot: platform-owned, readable by everyone, writable only by the catalog pipeline (§19).
CREATE TABLE catalog_snapshots (
  version     text PRIMARY KEY CHECK (version ~ '^sha256-[0-9a-f]{64}$'),
  mode        text NOT NULL CHECK (mode IN ('real', 'fixture')),
  content     jsonb NOT NULL,
  loaded_at   timestamptz NOT NULL DEFAULT now()
);

-- Tenant: a personal organization is created at signup (§15). Billing attaches here later.
CREATE TABLE organizations (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind        text NOT NULL DEFAULT 'personal' CHECK (kind IN ('personal')),
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE projects (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL REFERENCES organizations(id),
  name        text NOT NULL CHECK (length(name) BETWEEN 1 AND 200),
  created_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz            -- soft delete, then purge (§19)
);

-- A run is anonymous (org_id NULL) until saved (§8: first value before any signup).
-- The unguessable id is the capability to read an anonymous run (§18: runs are shareable and resumable by URL).
CREATE TABLE recommendation_runs (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            uuid REFERENCES organizations(id),
  project_id        uuid REFERENCES projects(id),
  status            text NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'understood', 'complete', 'failed', 'queued')),
  catalog_version   text NOT NULL REFERENCES catalog_snapshots(version),
  -- Every run stores model, prompt, taxonomy and catalog versions (§2, kept from v2).
  pipeline_versions jsonb NOT NULL DEFAULT '{}'::jsonb,
  degraded          text CHECK (degraded IN ('template_explanations', 'deterministic_only')),
  created_at        timestamptz NOT NULL DEFAULT now(),
  -- Anonymous run content is deleted after this (§12: 30 days, ASSUMPTION, REGISTER A-010). NULL once saved.
  expires_at        timestamptz,
  CHECK (project_id IS NULL OR org_id IS NOT NULL),
  CHECK (org_id IS NOT NULL OR expires_at IS NOT NULL)
);
CREATE INDEX ON recommendation_runs (org_id, created_at DESC);
CREATE INDEX ON recommendation_runs (expires_at) WHERE expires_at IS NOT NULL;

-- Versioned context (§19 ContextSnapshot). Raw text is trimmed after its window; the structured profile stays (§12).
CREATE TABLE context_snapshots (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id              uuid NOT NULL REFERENCES recommendation_runs(id) ON DELETE CASCADE,
  org_id              uuid REFERENCES organizations(id),
  version             int  NOT NULL DEFAULT 1 CHECK (version >= 1),
  raw_text            text,          -- already redacted before storage (§12)
  raw_text_expires_at timestamptz,
  declared_clients    text[] NOT NULL DEFAULT '{}',
  constraints         jsonb NOT NULL DEFAULT '{}'::jsonb,
  profile             jsonb,         -- ProjectProfile incl. user edits (edits are ground truth, §9)
  created_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (run_id, version),
  CHECK (raw_text IS NULL OR raw_text_expires_at IS NOT NULL)
);

-- Stores IDs, versions and score components, not rendered text (§19). Re-render from the catalog snapshot.
CREATE TABLE recommendations (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id             uuid NOT NULL REFERENCES recommendation_runs(id) ON DELETE CASCADE,
  org_id             uuid REFERENCES organizations(id),
  offering_id        text NOT NULL,
  catalog_version    text NOT NULL REFERENCES catalog_snapshots(version),
  lane               text NOT NULL CHECK (lane IN ('direct', 'also_worth_knowing', 'not_needed')),
  rank               int  NOT NULL CHECK (rank >= 1),
  capability_id      text NOT NULL,
  need_type          text NOT NULL CHECK (need_type IN ('stated', 'implied', 'latent', 'present', 'not_relevant')),
  match_band         text NOT NULL CHECK (match_band IN ('strong', 'good', 'possible', 'weak', 'skip')),
  match_components   jsonb NOT NULL,
  confidence_band    text NOT NULL CHECK (confidence_band IN ('high', 'medium', 'low')),
  confidence_inputs  jsonb NOT NULL,
  evidence_ids       text[] NOT NULL DEFAULT '{}',
  UNIQUE (run_id, lane, rank)
);

-- Feedback uses reason codes, not free text only (§19). The reason list is not yet specified (wireframe UNKNOWN).
CREATE TABLE feedback (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id             uuid NOT NULL REFERENCES recommendation_runs(id) ON DELETE CASCADE,
  recommendation_id  uuid REFERENCES recommendations(id) ON DELETE CASCADE,
  org_id             uuid REFERENCES organizations(id),
  kind               text NOT NULL CHECK (kind IN ('useful', 'not_useful', 'already_knew', 'try_it', 'it_worked', 'stuck',
                                                   'still_using', 'helped', 'knew_before')),
  value              boolean,
  reason_code        text CHECK (reason_code ~ '^[a-z0-9_]{1,40}$'),
  created_at         timestamptz NOT NULL DEFAULT now()
);

-- Append-only usage and AI cost ledger (§19): ties each run to its AI cost.
CREATE TABLE usage_events (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  run_id          uuid REFERENCES recommendation_runs(id) ON DELETE SET NULL,
  org_id          uuid REFERENCES organizations(id),
  kind            text NOT NULL CHECK (kind IN ('model_call', 'run_started', 'run_completed')),
  stage           text,
  model           text,
  input_tokens    int CHECK (input_tokens >= 0),
  output_tokens   int CHECK (output_tokens >= 0),
  cost_usd_micros bigint CHECK (cost_usd_micros >= 0),
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- Kill switches: flag rows read on each request (§17): AI off, revoke one tool, pause a source, sign-ups off (§14).
CREATE TABLE flags (
  key        text PRIMARY KEY CHECK (key ~ '^[a-z0-9_:.-]{1,100}$'),
  enabled    boolean NOT NULL,
  note       text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ---------- Privileges ----------
GRANT SELECT ON catalog_snapshots TO cafai_app, cafai_catalog;
GRANT INSERT ON catalog_snapshots TO cafai_catalog;
GRANT SELECT ON flags TO cafai_app;
GRANT SELECT, INSERT, UPDATE ON organizations, projects, recommendation_runs, context_snapshots TO cafai_app;
GRANT DELETE ON recommendation_runs, context_snapshots, projects TO cafai_app;
GRANT SELECT, INSERT ON recommendations, feedback TO cafai_app;
GRANT INSERT, SELECT ON usage_events TO cafai_app;   -- append-only: no UPDATE/DELETE

-- ---------- Row-level security (§14 second wall) ----------
-- The app sets, per transaction: app.org_id (signed-in tenant) and/or app.run_id (the run named in the URL).
CREATE FUNCTION app_org_id() RETURNS uuid LANGUAGE sql STABLE AS
  $$ SELECT NULLIF(current_setting('app.org_id', true), '')::uuid $$;
CREATE FUNCTION app_run_id() RETURNS uuid LANGUAGE sql STABLE AS
  $$ SELECT NULLIF(current_setting('app.run_id', true), '')::uuid $$;

ALTER TABLE organizations        ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects             ENABLE ROW LEVEL SECURITY;
ALTER TABLE recommendation_runs  ENABLE ROW LEVEL SECURITY;
ALTER TABLE context_snapshots    ENABLE ROW LEVEL SECURITY;
ALTER TABLE recommendations      ENABLE ROW LEVEL SECURITY;
ALTER TABLE feedback             ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_events         ENABLE ROW LEVEL SECURITY;

CREATE POLICY org_self ON organizations FOR ALL TO cafai_app
  USING (id = app_org_id()) WITH CHECK (id = app_org_id());
-- Personal-org creation at signup is designed in L7 (REGISTER A-003); no broader insert policy until then.

CREATE POLICY project_tenant ON projects FOR ALL TO cafai_app
  USING (org_id = app_org_id()) WITH CHECK (org_id = app_org_id());

-- A run is visible to its org, or (anonymous only) to the request that names its id.
CREATE POLICY run_access ON recommendation_runs FOR ALL TO cafai_app
  USING ((org_id IS NOT NULL AND org_id = app_org_id()) OR (org_id IS NULL AND id = app_run_id()))
  WITH CHECK ((org_id IS NOT NULL AND org_id = app_org_id()) OR (org_id IS NULL AND id = app_run_id()));

-- Child rows follow their run (the run policy is applied inside the subquery). Columns are table-qualified:
-- unqualified names inside the subquery would resolve to recommendation_runs and make the check vacuous.
CREATE POLICY ctx_access ON context_snapshots FOR ALL TO cafai_app
  USING (EXISTS (SELECT 1 FROM recommendation_runs r WHERE r.id = context_snapshots.run_id))
  WITH CHECK (EXISTS (SELECT 1 FROM recommendation_runs r WHERE r.id = context_snapshots.run_id AND r.org_id IS NOT DISTINCT FROM context_snapshots.org_id));
CREATE POLICY rec_access ON recommendations FOR ALL TO cafai_app
  USING (EXISTS (SELECT 1 FROM recommendation_runs r WHERE r.id = recommendations.run_id))
  WITH CHECK (EXISTS (SELECT 1 FROM recommendation_runs r WHERE r.id = recommendations.run_id AND r.org_id IS NOT DISTINCT FROM recommendations.org_id));
CREATE POLICY fb_access ON feedback FOR ALL TO cafai_app
  USING (EXISTS (SELECT 1 FROM recommendation_runs r WHERE r.id = feedback.run_id))
  WITH CHECK (EXISTS (SELECT 1 FROM recommendation_runs r WHERE r.id = feedback.run_id AND r.org_id IS NOT DISTINCT FROM feedback.org_id));
CREATE POLICY usage_access ON usage_events FOR ALL TO cafai_app
  USING (EXISTS (SELECT 1 FROM recommendation_runs r WHERE r.id = usage_events.run_id))
  WITH CHECK (EXISTS (SELECT 1 FROM recommendation_runs r
                      WHERE r.id = usage_events.run_id AND r.org_id IS NOT DISTINCT FROM usage_events.org_id));
