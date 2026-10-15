CREATE TABLE fellestall_data.snapshot (
  id text PRIMARY KEY CHECK (id ~ '^[a-f0-9]{64}$'),
  source_commit text NOT NULL CHECK (source_commit ~ '^[a-f0-9]{40,64}$'),
  manifest jsonb NOT NULL,
  file_count integer NOT NULL CHECK (file_count > 0),
  total_bytes bigint NOT NULL CHECK (total_bytes >= 0),
  state text NOT NULL DEFAULT 'staging' CHECK (state IN ('staging', 'complete', 'verified')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE fellestall_data.file (
  snapshot_id text NOT NULL REFERENCES fellestall_data.snapshot(id),
  path text NOT NULL,
  sha256 text NOT NULL CHECK (sha256 ~ '^[a-f0-9]{64}$'),
  bytes bigint NOT NULL CHECK (bytes >= 0),
  compressed_bytes bigint NOT NULL CHECK (compressed_bytes > 0),
  chunks integer NOT NULL CHECK (chunks > 0),
  PRIMARY KEY (snapshot_id, path)
);
CREATE TABLE fellestall_data.chunk (
  snapshot_id text NOT NULL,
  path text NOT NULL,
  chunk_index integer NOT NULL CHECK (chunk_index >= 0),
  content bytea NOT NULL CHECK (octet_length(content) BETWEEN 1 AND 262144),
  PRIMARY KEY (snapshot_id, path, chunk_index),
  FOREIGN KEY (snapshot_id, path) REFERENCES fellestall_data.file(snapshot_id, path)
);
CREATE TABLE fellestall_data.active_snapshot (
  slot text PRIMARY KEY CHECK (slot = 'production'),
  snapshot_id text NOT NULL REFERENCES fellestall_data.snapshot(id),
  activated_at timestamptz NOT NULL DEFAULT now()
);
