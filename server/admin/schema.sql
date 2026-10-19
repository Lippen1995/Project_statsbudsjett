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
