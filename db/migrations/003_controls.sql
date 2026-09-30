-- L8 abuse, cost and operational controls. Sources: plan §14 (denial of wallet, audit, kill switches, rate limiting),
-- §17 (flag rows read on each request, Postgres job queue), §12 (retention), §15 (audit events, MVP basic).

-- Quota counters keyed by a salted hash (never a raw IP or email; §12 minimization). Fixed windows.
CREATE TABLE quota_counters (
  key          text NOT NULL CHECK (key ~ '^[a-z_]+:[0-9a-f]{64}$'),
  window_start timestamptz NOT NULL,
  count        int NOT NULL DEFAULT 0 CHECK (count >= 0),
  PRIMARY KEY (key, window_start)
);
GRANT SELECT, INSERT, UPDATE ON quota_counters TO cafai_app;

-- Atomic increment; returns the new count for the window.
CREATE FUNCTION quota_hit(p_key text, p_window_start timestamptz) RETURNS int
LANGUAGE sql AS $$
  INSERT INTO quota_counters (key, window_start, count) VALUES (p_key, p_window_start, 1)
  ON CONFLICT (key, window_start) DO UPDATE SET count = quota_counters.count + 1
  RETURNING count
$$;

-- AI spend today across all tenants, as one number only (the app role cannot read other tenants' rows; §14 budget breaker).
CREATE FUNCTION spend_today_micros() RETURNS bigint
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(sum(cost_usd_micros), 0)::bigint FROM usage_events WHERE created_at >= date_trunc('day', now())
$$;
REVOKE ALL ON FUNCTION spend_today_micros() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION spend_today_micros() TO cafai_app;

-- Retention (§12): delete expired anonymous runs, trim raw text past its window, drop old quota windows.
CREATE FUNCTION purge_expired() RETURNS TABLE (runs int, raw_texts int, quota_rows int)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r int; t int; q int;
BEGIN
  DELETE FROM recommendation_runs WHERE org_id IS NULL AND expires_at < now();
  GET DIAGNOSTICS r = ROW_COUNT;
  UPDATE context_snapshots SET raw_text = NULL, raw_text_expires_at = NULL WHERE raw_text IS NOT NULL AND raw_text_expires_at < now();
  GET DIAGNOSTICS t = ROW_COUNT;
  DELETE FROM quota_counters WHERE window_start < now() - interval '2 days';
  GET DIAGNOSTICS q = ROW_COUNT;
  RETURN QUERY SELECT r, t, q;
END $$;
REVOKE ALL ON FUNCTION purge_expired() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION purge_expired() TO cafai_app;

-- Append-only audit log (§14, §15). Flag changes are admin actions, recorded by trigger.
CREATE TABLE audit_events (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  kind       text NOT NULL,
  subject    text,
  detail     jsonb NOT NULL DEFAULT '{}'::jsonb,
  actor      text NOT NULL DEFAULT current_user,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT INSERT ON audit_events TO cafai_app;

CREATE FUNCTION audit_flag_change() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO audit_events (kind, subject, detail)
  VALUES ('flag_' || lower(TG_OP), COALESCE(NEW.key, OLD.key),
          jsonb_build_object('old', to_jsonb(OLD), 'new', to_jsonb(NEW)));
  RETURN COALESCE(NEW, OLD);
END $$;
CREATE TRIGGER flags_audit AFTER INSERT OR UPDATE OR DELETE ON flags FOR EACH ROW EXECUTE FUNCTION audit_flag_change();
