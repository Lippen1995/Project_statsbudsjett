PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS entity (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('municipality', 'county', 'country', 'peer_group')),
  parent_id TEXT REFERENCES entity(id),
  peer_group_id TEXT REFERENCES entity(id),
  active INTEGER NOT NULL DEFAULT 1,
  valid_from INTEGER,
  valid_to INTEGER,
  source_label TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS entity_kind_code ON entity(kind, code);
CREATE INDEX IF NOT EXISTS entity_parent ON entity(parent_id);

CREATE TABLE IF NOT EXISTS entity_relation (
  source_entity_id TEXT NOT NULL REFERENCES entity(id),
  target_entity_id TEXT NOT NULL REFERENCES entity(id),
  change_year INTEGER NOT NULL,
  relation_type TEXT NOT NULL CHECK (relation_type IN ('exact_successor', 'boundary_change')),
  source TEXT NOT NULL,
  PRIMARY KEY (source_entity_id, target_entity_id, change_year)
);

CREATE INDEX IF NOT EXISTS entity_relation_target ON entity_relation(target_entity_id, relation_type);

CREATE TABLE IF NOT EXISTS entity_code (
  entity_id TEXT NOT NULL REFERENCES entity(id),
  code TEXT NOT NULL,
  valid_from INTEGER,
  valid_to INTEGER,
  source TEXT NOT NULL,
  PRIMARY KEY (entity_id, code, valid_from)
);

CREATE TABLE IF NOT EXISTS classification (
  dimension TEXT NOT NULL,
  code TEXT NOT NULL,
  label TEXT NOT NULL,
  kind TEXT NOT NULL,
  PRIMARY KEY (dimension, code)
);

CREATE TABLE IF NOT EXISTS dataset (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  scenario TEXT NOT NULL CHECK (scenario IN ('actuals', 'budget', 'transfer')),
  source_system TEXT NOT NULL
);

INSERT OR IGNORE INTO dataset VALUES ('kostra_actuals', 'KOSTRA regnskap', 'actuals', 'SSB Statbank');

CREATE TABLE IF NOT EXISTS fact (
  dataset_id TEXT NOT NULL DEFAULT 'kostra_actuals' REFERENCES dataset(id),
  entity_id TEXT NOT NULL REFERENCES entity(id),
  year INTEGER NOT NULL,
  metric_code TEXT NOT NULL,
  function_code TEXT NOT NULL DEFAULT '',
  accounting_art_code TEXT NOT NULL DEFAULT '',
  amount REAL,
  per_capita REAL,
  source_table TEXT NOT NULL,
  PRIMARY KEY (dataset_id, entity_id, year, metric_code, function_code, accounting_art_code, source_table)
);

CREATE INDEX IF NOT EXISTS fact_map ON fact(year, metric_code, entity_id);
CREATE INDEX IF NOT EXISTS fact_detail ON fact(entity_id, function_code, accounting_art_code, year);

CREATE TABLE IF NOT EXISTS source_run (
  source_table TEXT PRIMARY KEY,
  fetched_at TEXT NOT NULL,
  label TEXT NOT NULL,
  latest_period INTEGER NOT NULL
);
