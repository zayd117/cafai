-- L6: what a results page needs to re-render a run (plan §18: runs are shareable and resumable by URL).
-- Catalog facts (names, commands, access) are NOT stored: they render from the run's catalog snapshot (§19).
-- Stored here: the run outcome, the non-catalog parts of the result, and each pick's validated explanation
-- (model output tied to evidence ids; REGISTER A-027).
ALTER TABLE recommendation_runs
  ADD COLUMN outcome text CHECK (outcome IN ('picks', 'needs_confirmation', 'needs_clarification', 'nothing_needed', 'no_good_pick', 'out_of_scope')),
  ADD COLUMN details jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN parent_run_id uuid REFERENCES recommendation_runs(id) ON DELETE SET NULL;

ALTER TABLE recommendations
  ADD COLUMN explanation jsonb,
  ADD COLUMN do_you_need_it text CHECK (do_you_need_it IN ('needed_now', 'useful_later', 'probably_not')),
  ADD COLUMN notes text[] NOT NULL DEFAULT '{}';

ALTER TABLE recommendations DROP CONSTRAINT recommendations_lane_check;
ALTER TABLE recommendations ADD CONSTRAINT recommendations_lane_check CHECK (lane IN ('direct', 'also_worth_knowing'));
