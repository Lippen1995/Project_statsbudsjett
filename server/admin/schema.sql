CREATE TABLE IF NOT EXISTS ft_admin_user (
  id text PRIMARY KEY, name text NOT NULL, email text NOT NULL UNIQUE,
  "emailVerified" boolean NOT NULL DEFAULT false, image text,
  "createdAt" timestamptz NOT NULL DEFAULT now(), "updatedAt" timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS ft_admin_session (
  id text PRIMARY KEY, "expiresAt" timestamptz NOT NULL, token text NOT NULL UNIQUE,
  "createdAt" timestamptz NOT NULL DEFAULT now(), "updatedAt" timestamptz NOT NULL DEFAULT now(),
  "ipAddress" text, "userAgent" text, "userId" text NOT NULL REFERENCES ft_admin_user(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS ft_admin_session_user ON ft_admin_session("userId");
CREATE TABLE IF NOT EXISTS ft_admin_account (
  id text PRIMARY KEY, "accountId" text NOT NULL, "providerId" text NOT NULL,
  "userId" text NOT NULL REFERENCES ft_admin_user(id) ON DELETE CASCADE,
  "accessToken" text, "refreshToken" text, "idToken" text,
  "accessTokenExpiresAt" timestamptz, "refreshTokenExpiresAt" timestamptz,
  scope text, password text,
  "createdAt" timestamptz NOT NULL DEFAULT now(), "updatedAt" timestamptz NOT NULL DEFAULT now(),
  UNIQUE ("providerId", "accountId")
);
CREATE INDEX IF NOT EXISTS ft_admin_account_user ON ft_admin_account("userId");
CREATE TABLE IF NOT EXISTS ft_admin_verification (
  id text PRIMARY KEY, identifier text NOT NULL, value text NOT NULL,
  "expiresAt" timestamptz NOT NULL, "createdAt" timestamptz DEFAULT now(), "updatedAt" timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ft_admin_verification_identifier ON ft_admin_verification(identifier);
CREATE TABLE IF NOT EXISTS ft_admin_rate_limit (
  id text PRIMARY KEY, key text NOT NULL UNIQUE, count integer NOT NULL, "lastRequest" bigint NOT NULL
);
CREATE TABLE IF NOT EXISTS ft_admin_daily (
  day date NOT NULL DEFAULT CURRENT_DATE, path text NOT NULL, source text NOT NULL, device text NOT NULL,
  views integer NOT NULL DEFAULT 0,
  lcp_sum double precision NOT NULL DEFAULT 0, lcp_count integer NOT NULL DEFAULT 0,
  inp_sum double precision NOT NULL DEFAULT 0, inp_count integer NOT NULL DEFAULT 0,
  cls_sum double precision NOT NULL DEFAULT 0, cls_count integer NOT NULL DEFAULT 0,
  PRIMARY KEY (day, path, source, device)
);
CREATE TABLE IF NOT EXISTS ft_admin_ingest_limit (
  key text PRIMARY KEY, count integer NOT NULL DEFAULT 1, expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS ft_admin_ingest_expiry ON ft_admin_ingest_limit(expires_at);
CREATE TABLE IF NOT EXISTS ft_admin_schema (
  id integer PRIMARY KEY CHECK (id = 1), version integer NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS ft_admin_minute (
  minute timestamptz NOT NULL, device text NOT NULL,
  views integer NOT NULL DEFAULT 0,
  lcp_sum double precision NOT NULL DEFAULT 0, lcp_count integer NOT NULL DEFAULT 0,
  inp_sum double precision NOT NULL DEFAULT 0, inp_count integer NOT NULL DEFAULT 0,
  cls_sum double precision NOT NULL DEFAULT 0, cls_count integer NOT NULL DEFAULT 0,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (minute, device)
);
CREATE TABLE IF NOT EXISTS ft_admin_health_state (
  id integer PRIMARY KEY CHECK (id = 1), report jsonb,
  checked_at timestamptz, lease_owner text, lease_until timestamptz
);
CREATE TABLE IF NOT EXISTS ft_admin_health_events (
  id text PRIMARY KEY, created_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL, summary text NOT NULL, components jsonb NOT NULL
);
CREATE INDEX IF NOT EXISTS ft_admin_health_event_time ON ft_admin_health_events(created_at);
CREATE TABLE IF NOT EXISTS ft_admin_health_samples (
  minute timestamptz NOT NULL, service text NOT NULL,
  checks integer NOT NULL, operational integer NOT NULL,
  PRIMARY KEY (minute, service)
);
ALTER TABLE ft_admin_user ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'viewer';
ALTER TABLE ft_admin_user ADD COLUMN IF NOT EXISTS banned boolean NOT NULL DEFAULT false;
ALTER TABLE ft_admin_user ADD COLUMN IF NOT EXISTS "banReason" text;
ALTER TABLE ft_admin_user ADD COLUMN IF NOT EXISTS "banExpires" timestamptz;
ALTER TABLE ft_admin_user ADD COLUMN IF NOT EXISTS "twoFactorEnabled" boolean NOT NULL DEFAULT false;
ALTER TABLE ft_admin_session ADD COLUMN IF NOT EXISTS "impersonatedBy" text;
UPDATE ft_admin_user SET role='admin' WHERE lower(email)='info@fjordinsight.com' AND role='viewer';
CREATE TABLE IF NOT EXISTS ft_admin_two_factor (
  id text PRIMARY KEY, secret text NOT NULL, "backupCodes" text NOT NULL,
  "userId" text NOT NULL REFERENCES ft_admin_user(id) ON DELETE CASCADE,
  verified boolean NOT NULL DEFAULT true, "failedVerificationCount" integer NOT NULL DEFAULT 0,
  "lockedUntil" timestamptz
);
CREATE INDEX IF NOT EXISTS ft_admin_two_factor_user ON ft_admin_two_factor("userId");
CREATE TABLE IF NOT EXISTS ft_admin_records (
  collection text NOT NULL, id text NOT NULL, revision integer NOT NULL DEFAULT 1,
  data jsonb NOT NULL, created_by text NOT NULL, updated_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(collection,id)
);
CREATE INDEX IF NOT EXISTS ft_admin_records_updated ON ft_admin_records(collection,updated_at);
CREATE TABLE IF NOT EXISTS ft_admin_audit (
  id text PRIMARY KEY, actor_id text NOT NULL, actor_email text NOT NULL,
  action text NOT NULL, resource text NOT NULL, before_value jsonb, after_value jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ft_admin_audit_time ON ft_admin_audit(created_at);
CREATE TABLE IF NOT EXISTS ft_admin_metric_buckets (
  day date NOT NULL DEFAULT CURRENT_DATE, path text NOT NULL, device text NOT NULL,
  metric text NOT NULL, bucket integer NOT NULL, release text NOT NULL,
  samples integer NOT NULL DEFAULT 1,
  PRIMARY KEY(day,path,device,metric,bucket,release)
);
CREATE TABLE IF NOT EXISTS ft_admin_feature_daily (
  day date NOT NULL DEFAULT CURRENT_DATE, path text NOT NULL, feature text NOT NULL,
  device text NOT NULL, source text NOT NULL, counts integer NOT NULL DEFAULT 1,
  PRIMARY KEY(day,path,feature,device,source)
);
CREATE TABLE IF NOT EXISTS ft_admin_errors (
  day date NOT NULL DEFAULT CURRENT_DATE, path text NOT NULL, kind text NOT NULL,
  detail text NOT NULL, counts integer NOT NULL DEFAULT 1,
  last_seen_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(day,path,kind,detail)
);
CREATE TABLE IF NOT EXISTS ft_admin_notifications (
  id text PRIMARY KEY, dedupe_key text NOT NULL UNIQUE, type text NOT NULL,
  severity text NOT NULL, title text NOT NULL, detail text NOT NULL,
  resource text, created_at timestamptz NOT NULL DEFAULT now(), resolved_at timestamptz
);
CREATE TABLE IF NOT EXISTS ft_admin_deliveries (
  id text PRIMARY KEY, dedupe_key text NOT NULL UNIQUE, recipient text NOT NULL,
  type text NOT NULL, subject text NOT NULL, status text NOT NULL DEFAULT 'pending',
  provider_id text, error_code text, attempts integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(), sent_at timestamptz
);
CREATE TABLE IF NOT EXISTS ft_admin_backups (
  id text PRIMARY KEY, created_at timestamptz NOT NULL DEFAULT now(), created_by text NOT NULL,
  label text NOT NULL, checksum text NOT NULL, ciphertext text NOT NULL,
  record_count integer NOT NULL, restored_at timestamptz, tested_at timestamptz
);
CREATE TABLE IF NOT EXISTS ft_admin_provider_cache (
  provider text PRIMARY KEY, data jsonb NOT NULL, checked_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS ft_admin_checkly_results (
  id text PRIMARY KEY, check_id text NOT NULL, check_name text NOT NULL,
  checked_at timestamptz NOT NULL, runs integer NOT NULL, failed boolean NOT NULL,
  degraded boolean NOT NULL, response_ms double precision,
  observed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ft_admin_checkly_time ON ft_admin_checkly_results(checked_at);
CREATE SEQUENCE IF NOT EXISTS ft_admin_revision_seq;
SELECT setval('ft_admin_revision_seq',GREATEST((SELECT COALESCE(MAX(revision),0)+1 FROM ft_admin_records),(SELECT last_value+1 FROM ft_admin_revision_seq)),false);
ALTER TABLE ft_admin_deliveries ADD COLUMN IF NOT EXISTS claimed_at timestamptz;
CREATE TABLE IF NOT EXISTS ft_admin_delivery_items (
  recipient text NOT NULL, notification_id text NOT NULL, state_key text NOT NULL,
  delivered_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(recipient,notification_id,state_key)
);

ALTER TABLE ft_admin_notifications ADD COLUMN IF NOT EXISTS opened_at timestamptz NOT NULL DEFAULT now();
CREATE TABLE IF NOT EXISTS ft_admin_tasks (
  name text PRIMARY KEY, owner text NOT NULL, lease_until timestamptz NOT NULL,
  last_finished_at timestamptz
);

ALTER TABLE ft_admin_checkly_results ADD COLUMN IF NOT EXISTS attempts integer;
UPDATE ft_admin_checkly_results SET attempts=GREATEST(runs-1,0),runs=GREATEST(runs-1,1) WHERE attempts IS NULL;
DELETE FROM ft_admin_provider_cache WHERE provider='checkly';
