-- Hardening from the 2026-10-08 audit (CAF-003, CAF-007).

-- Budget holds (§14 denial of wallet): a run that will call a paid model first reserves an allowance under one lock,
-- so two runs near the ceiling can't both pass. The hold is released in the transaction that records the run's real
-- usage. A hold that is never released (the run failed after spending) keeps counting for the rest of the day.
CREATE TABLE budget_holds (
  id         uuid PRIMARY KEY,
  micros     bigint NOT NULL CHECK (micros >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);
-- No table rights for the app role: it works only through the functions below.

CREATE OR REPLACE FUNCTION spend_today_micros() RETURNS bigint
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT (SELECT COALESCE(sum(cost_usd_micros), 0) FROM usage_events WHERE created_at >= date_trunc('day', now()))
       + (SELECT COALESCE(sum(micros), 0) FROM budget_holds WHERE created_at >= date_trunc('day', now()))
$$;

CREATE FUNCTION budget_reserve(p_id uuid, p_micros bigint, p_ceiling bigint) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- One reservation at a time; each statement after the lock sees everything committed before it.
  PERFORM pg_advisory_xact_lock(hashtext('cafai.budget_holds'));
  IF spend_today_micros() + p_micros > p_ceiling THEN
    RETURN false;
  END IF;
  INSERT INTO budget_holds (id, micros) VALUES (p_id, p_micros);
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION budget_reserve(uuid, bigint, bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION budget_reserve(uuid, bigint, bigint) TO cafai_app;

CREATE FUNCTION budget_release(p_id uuid) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  DELETE FROM budget_holds WHERE id = p_id
$$;
REVOKE ALL ON FUNCTION budget_release(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION budget_release(uuid) TO cafai_app;

-- Retention also drops old holds.
CREATE OR REPLACE FUNCTION purge_expired() RETURNS TABLE (runs int, raw_texts int, quota_rows int)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r int; t int; q int;
BEGIN
  DELETE FROM recommendation_runs WHERE org_id IS NULL AND expires_at < now();
  GET DIAGNOSTICS r = ROW_COUNT;
  UPDATE context_snapshots SET raw_text = NULL, raw_text_expires_at = NULL WHERE raw_text IS NOT NULL AND raw_text_expires_at < now();
  GET DIAGNOSTICS t = ROW_COUNT;
  DELETE FROM quota_counters WHERE window_start < now() - interval '2 days';
  GET DIAGNOSTICS q = ROW_COUNT;
  DELETE FROM budget_holds WHERE created_at < now() - interval '2 days';
  RETURN QUERY SELECT r, t, q;
END $$;

-- Audit events come only from the SECURITY DEFINER trigger; the app role can't write its own (CAF-007).
REVOKE INSERT ON audit_events FROM cafai_app;
