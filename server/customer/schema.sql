CREATE TABLE IF NOT EXISTS ft_customer_user (
  id text PRIMARY KEY, name text NOT NULL, email text NOT NULL UNIQUE,
  "emailVerified" boolean NOT NULL DEFAULT false, image text,
  "createdAt" timestamptz NOT NULL DEFAULT now(), "updatedAt" timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS ft_customer_session (
  id text PRIMARY KEY, "expiresAt" timestamptz NOT NULL, token text NOT NULL UNIQUE,
  "createdAt" timestamptz NOT NULL DEFAULT now(), "updatedAt" timestamptz NOT NULL DEFAULT now(),
  "ipAddress" text, "userAgent" text, "userId" text NOT NULL REFERENCES ft_customer_user(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS ft_customer_session_user ON ft_customer_session("userId");
CREATE TABLE IF NOT EXISTS ft_customer_account (
  id text PRIMARY KEY, "accountId" text NOT NULL, "providerId" text NOT NULL,
  "userId" text NOT NULL REFERENCES ft_customer_user(id) ON DELETE CASCADE,
  "accessToken" text, "refreshToken" text, "idToken" text,
  "accessTokenExpiresAt" timestamptz, "refreshTokenExpiresAt" timestamptz, scope text, password text,
  "createdAt" timestamptz NOT NULL DEFAULT now(), "updatedAt" timestamptz NOT NULL DEFAULT now(),
  UNIQUE ("providerId", "accountId")
);
CREATE INDEX IF NOT EXISTS ft_customer_account_user ON ft_customer_account("userId");
CREATE TABLE IF NOT EXISTS ft_customer_verification (
  id text PRIMARY KEY, identifier text NOT NULL, value text NOT NULL,
  "expiresAt" timestamptz NOT NULL, "createdAt" timestamptz DEFAULT now(), "updatedAt" timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ft_customer_verification_identifier ON ft_customer_verification(identifier);
CREATE TABLE IF NOT EXISTS ft_customer_rate_limit (
  id text PRIMARY KEY, key text NOT NULL UNIQUE, count integer NOT NULL, "lastRequest" bigint NOT NULL
);
CREATE TABLE IF NOT EXISTS ft_customer_access (
  user_id text PRIMARY KEY REFERENCES ft_customer_user(id) ON DELETE CASCADE,
  plan text NOT NULL DEFAULT 'free' CHECK (plan IN ('free', 'paid')),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS ft_customer_resource (
  kind text NOT NULL CHECK (kind IN ('projects','conversations','files','jobs')),
  id text NOT NULL, owner_id text NOT NULL REFERENCES ft_customer_user(id) ON DELETE CASCADE,
  title text NOT NULL, project_id text, conversation_id text,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(kind,id)
);
CREATE INDEX IF NOT EXISTS ft_customer_resource_owner ON ft_customer_resource(owner_id,kind,created_at);
ALTER TABLE ft_customer_resource ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
CREATE TABLE IF NOT EXISTS ft_customer_document (
  owner_id text NOT NULL REFERENCES ft_customer_user(id) ON DELETE CASCADE,
  kind text NOT NULL, id text NOT NULL, version integer NOT NULL DEFAULT 1,
  data text, updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(owner_id,kind,id)
);
CREATE TABLE IF NOT EXISTS ft_customer_file (
  id text PRIMARY KEY, owner_id text NOT NULL REFERENCES ft_customer_user(id) ON DELETE CASCADE,
  data text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS ft_customer_job (
  storage_key text PRIMARY KEY, owner_id text NOT NULL REFERENCES ft_customer_user(id) ON DELETE CASCADE,
  request_id text NOT NULL, data text, lease_token text, lease_until timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(owner_id,request_id)
);
CREATE TABLE IF NOT EXISTS ft_customer_erasure (
  owner_hash text NOT NULL, kind text NOT NULL, id text NOT NULL,
  erased_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(owner_hash,kind,id)
);
CREATE TABLE IF NOT EXISTS ft_customer_schema (
  id integer PRIMARY KEY CHECK (id = 1), version integer NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
