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
  scenario TEXT NOT NULL CHECK (scenario IN ('actuals', 'budget', 'transfer', 'tax')),
  source_system TEXT NOT NULL
);

INSERT OR IGNORE INTO dataset VALUES ('kostra_actuals', 'KOSTRA regnskap', 'actuals', 'SSB Statbank');
INSERT OR IGNORE INTO dataset VALUES ('kostra_state_transfers', 'Rammetilskudd til kommunene', 'transfer', 'SSB KOSTRA');
INSERT OR IGNORE INTO dataset VALUES ('ssb_tax_accounts', 'Statlige skatter og avgifter', 'tax', 'SSB Statbank');

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

CREATE TABLE IF NOT EXISTS public_flow_category (
  code TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('from_state', 'to_state')),
  actor_scope TEXT NOT NULL CHECK (actor_scope IN ('municipal_government', 'residents', 'employers', 'mixed')),
  description TEXT NOT NULL,
  sort_order INTEGER NOT NULL
);

INSERT OR IGNORE INTO public_flow_category VALUES
  ('state_block_grant', 'Rammetilskudd', 'from_state', 'municipal_government', 'Statens frie rammetilskudd til kommuneorganisasjonen.', 10),
  ('national_insurance_member', 'Medlemsavgift til folketrygden', 'to_state', 'residents', 'Medlemsavgift registrert i kommunens skatteregnskap.', 20),
  ('employer_national_insurance', 'Arbeidsgiveravgift til folketrygden', 'to_state', 'employers', 'Arbeidsgiveravgift registrert i kommunens skatteregnskap.', 30),
  ('common_tax', 'Fellesskatt', 'to_state', 'mixed', 'Fellesskatt registrert i kommunens skatteregnskap.', 40),
  ('state_income_wealth_tax', 'Formues- og inntektsskatt til staten', 'to_state', 'residents', 'Ordinær formues- og inntektsskatt til staten registrert i kommunens skatteregnskap.', 50);

CREATE TABLE IF NOT EXISTS public_flow_fact (
  dataset_id TEXT NOT NULL REFERENCES dataset(id),
  entity_id TEXT NOT NULL REFERENCES entity(id),
  year INTEGER NOT NULL CHECK (year BETWEEN 1900 AND 2200),
  category_code TEXT NOT NULL REFERENCES public_flow_category(code),
  amount REAL,
  per_capita REAL,
  basis TEXT NOT NULL CHECK (basis IN ('actual', 'budget', 'estimate')),
  source_table TEXT NOT NULL,
  source_period TEXT NOT NULL,
  PRIMARY KEY (dataset_id, entity_id, year, category_code, source_table)
);

CREATE INDEX IF NOT EXISTS public_flow_entity_year ON public_flow_fact(entity_id, year);

CREATE TABLE IF NOT EXISTS source_run (
  source_table TEXT PRIMARY KEY,
  fetched_at TEXT NOT NULL,
  label TEXT NOT NULL,
  latest_period INTEGER NOT NULL
);
