import { randomUUID } from 'node:crypto'

export const fail = (message, status = 400) => {
  throw Object.assign(Error(message), { status })
}
export const roles = ['admin', 'editor', 'viewer']
export function roleOf(user) {
  return roles.includes(user?.role) ? user.role : 'viewer'
}
export function requireRole(user, allowed = ['admin']) {
  if (!allowed.includes(roleOf(user)))
    fail('Du har ikke tilgang til denne handlingen.', 403)
}
export function text(value, min = 0, max = 1000) {
  if (
    typeof value !== 'string' ||
    value.trim().length < min ||
    value.length > max ||
    value.includes('\0')
  )
    fail('Teksten har ugyldig lengde eller innhold.')
  return value.trim()
}
export function enumValue(value, allowed) {
  if (!allowed.includes(value)) fail('Ugyldig valg.')
  return value
}
export function validId(value) {
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(value ?? ''))
    fail('Ugyldig identifikator.')
  return value
}
export function isoDate(value, optional = false) {
  if (optional && !value) return null
  if (
    typeof value === 'string' &&
    value.includes('T') &&
    !/(Z|[+-]\d{2}:\d{2})$/.test(value)
  )
    fail('Velg et gyldig tidspunkt i norsk tid.')
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value)))
    fail('Velg et gyldig tidspunkt.')
  return new Date(value).toISOString()
}
export function httpsUrl(value) {
  try {
    const u = new URL(value)
    if (
      u.protocol !== 'https:' ||
      u.username ||
      u.password ||
      u.href.length > 1000
    )
      throw Error()
    return u.href
  } catch {
    fail('Bruk en gyldig HTTPS-adresse uten passord.')
  }
}
const clock = (value) =>
  !value
    ? ''
    : /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)
      ? value
      : fail('Bruk klokkeslett som 22:00.')
export function csv(columns, rows) {
  const cell = (value) => {
    let s = value == null ? '' : String(value)
    if (/^\s*[=+@\-]|^[\t\r\n]/.test(s)) s = "'" + s
    return '"' + s.replaceAll('"', '""') + '"'
  }
  return (
    '\uFEFF' +
    [
      columns.map((c) => cell(c.label)).join(';'),
      ...rows.map((row) => columns.map((c) => cell(row[c.key])).join(';')),
    ].join('\r\n')
  )
}

export const collections = {
  incidents: ['admin', 'editor'],
  maintenance: ['admin'],
  feedback: ['admin', 'editor'],
  rules: ['admin'],
  issues: ['admin', 'editor'],
  recipients: ['admin'],
  preferences: ['admin'],
  checklists: ['admin', 'editor'],
  sourcePolicies: ['admin'],
  integrationPolicies: ['admin'],
  acknowledgements: ['admin', 'editor'],
  contentMetadata: ['admin', 'editor'],
  reports: ['admin', 'editor'],
}
const validators = {
  incidents: (v) => ({
    title: text(v.title, 5, 180),
    note: text(v.note, 1, 12000),
    status: enumValue(v.status, [
      'investigating',
      'identified',
      'monitoring',
      'resolved',
    ]),
    service: enumValue(v.service, [
      'website',
      'database',
      'sven',
      'data',
      'distribution',
      'other',
    ]),
  }),
  maintenance: (v) => {
    const start = isoDate(v.start),
      end = isoDate(v.end)
    if (Date.parse(end) <= Date.parse(start))
      fail('Vedlikeholdet må slutte etter at det starter.')
    return {
      title: text(v.title, 5, 180),
      note: text(v.note, 0, 4000),
      start,
      end,
      status: enumValue(v.status, [
        'planned',
        'active',
        'completed',
        'cancelled',
      ]),
    }
  },
  feedback: (v) => ({
    article: text(v.article, 1, 160),
    category: enumValue(v.category, [
      'language',
      'sources',
      'scope',
      'numbers',
      'other',
    ]),
    note: text(v.note, 5, 12000),
    correction: text(v.correction || '', 0, 12000),
    kind: enumValue(v.kind, ['correction', 'rule']),
    status: enumValue(v.status || 'open', ['open', 'reviewed', 'resolved']),
    sourceVersion: text(v.sourceVersion || '', 0, 64),
  }),
  rules: (v) => ({
    title: text(v.title, 5, 180),
    rule: text(v.rule, 10, 4000),
    provenance: text(v.provenance, 5, 1000),
    feedbackId: text(v.feedbackId || '', 0, 100),
    status: enumValue(v.status || 'proposed', [
      'proposed',
      'active',
      'archived',
    ]),
    scope: enumValue(v.scope || 'all', [
      'all',
      'language',
      'sources',
      'scope',
      'numbers',
    ]),
  }),
  issues: (v) => ({
    title: text(v.title, 5, 180),
    note: text(v.note, 5, 12000),
    type: enumValue(v.type, ['bug', 'improvement']),
    status: enumValue(v.status, ['open', 'in-progress', 'resolved']),
    priority: enumValue(v.priority, ['low', 'normal', 'high']),
  }),
  recipients: (v) => {
    const email = text(v.email, 5, 254).toLowerCase()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      fail('Ugyldig e-postadresse.')
    return {
      email,
      name: text(v.name || '', 0, 100),
      types: Array.isArray(v.types)
        ? [
            ...new Set(
              v.types.map((t) =>
                enumValue(t, [
                  'operations',
                  'data',
                  'editorial',
                  'security',
                  'quota',
                ]),
              ),
            ),
          ]
        : [],
      digest: enumValue(v.digest || 'none', ['none', 'daily', 'weekly']),
      active: Boolean(v.active),
    }
  },
  sourcePolicies: (v) => ({
    source: text(v.source, 1, 120),
    expectedDays: Math.max(
      1,
      Math.min(730, Number.isInteger(v.expectedDays) ? v.expectedDays : 30),
    ),
    nextExpected: isoDate(v.nextExpected, true),
    note: text(v.note || '', 0, 1000),
  }),
  integrationPolicies: (v) => ({
    integration: enumValue(v.integration, [
      'github',
      'checkly',
      'neon',
      'email',
      'linkedin',
      'domain',
      'ssl',
    ]),
    expiresAt: isoDate(v.expiresAt, true),
    note: text(v.note || '', 0, 1000),
  }),
  contentMetadata: (v) => ({
    slug: text(v.slug, 1, 160),
    image: v.image ? httpsUrl(v.image) : '',
    imageAlt: text(v.imageAlt || '', 0, 300),
    tags: Array.isArray(v.tags)
      ? v.tags.slice(0, 15).map((s) => text(s, 1, 60))
      : [],
  }),
  checklists: (v) => ({
    article: text(v.article, 1, 160),
    head: text(v.head, 40, 40),
    numbers: Boolean(v.numbers),
    sources: Boolean(v.sources),
    scope: Boolean(v.scope),
    title: Boolean(v.title),
    conclusion: Boolean(v.conclusion),
    images: Boolean(v.images),
    note: text(v.note || '', 0, 2000),
  }),
  acknowledgements: (v) => ({
    key: text(v.key, 1, 180),
    acknowledged: Boolean(v.acknowledged),
  }),
  preferences: (v) => ({
    digest: enumValue(v.digest || 'none', ['none', 'daily', 'weekly']),
    severity: enumValue(v.severity || 'warning', [
      'info',
      'warning',
      'critical',
    ]),
    quietStart: clock(v.quietStart),
    quietEnd: clock(v.quietEnd),
    groupMinutes: Number.isInteger(v.groupMinutes)
      ? Math.min(1440, Math.max(5, v.groupMinutes))
      : 30,
  }),
  reports: (v) => ({
    month: /^20\d{2}-(?:0[1-9]|1[0-2])$/.test(v.month ?? '')
      ? v.month
      : fail('Velg en gyldig måned.'),
    title: text(v.title, 1, 180),
    note: text(v.note || '', 0, 4000),
  }),
}

export async function audit(
  sql,
  user,
  action,
  resource,
  before = null,
  after = null,
) {
  await sql.query(
    'INSERT INTO ft_admin_audit(id, actor_id, actor_email, action, resource, before_value, after_value) VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb)',
    [
      randomUUID(),
      user.id,
      user.email,
      action,
      resource,
      JSON.stringify(before),
      JSON.stringify(after),
    ],
  )
}

export function recordStore(sql) {
  return {
    async list(collection, { q = '', limit = 100 } = {}) {
      if (!collections[collection]) fail('Ukjent område.', 404)
      return sql.query(
        'SELECT id, revision, data, created_at, updated_at, updated_by FROM ft_admin_records WHERE collection=$1 AND data::text ILIKE $2 ORDER BY updated_at DESC, id LIMIT $3',
        [
          collection,
          '%' + text(q, 0, 120) + '%',
          Math.min(200, Math.max(1, limit)),
        ],
      )
    },
    async write(user, collection, value) {
      requireRole(user, collections[collection] || [])
      if (!validators[collection]) fail('Ukjent område.', 404)
      const id = value.id ? validId(value.id) : randomUUID()
      const data = validators[collection](value.data)
      const revision = value.revision ?? 0
      if (!Number.isInteger(revision) || revision < 0) fail('Ugyldig versjon.')
      const rows = await sql.query(
        `WITH previous AS (
        SELECT data FROM ft_admin_records WHERE collection=$1 AND id=$2 AND revision=$3 FOR UPDATE
      ), saved AS (
        INSERT INTO ft_admin_records(collection,id,revision,data,created_by,updated_by)
        SELECT $1,$2,nextval('ft_admin_revision_seq'),$4::jsonb,$5,$5 WHERE $3=0
        ON CONFLICT (collection,id) DO UPDATE SET data=EXCLUDED.data, revision=nextval('ft_admin_revision_seq'), updated_at=now(), updated_by=$5
        WHERE ft_admin_records.revision=$3
        RETURNING id,revision,data,created_at,updated_at,updated_by
      ), changed AS (
        UPDATE ft_admin_records SET data=$4::jsonb,revision=nextval('ft_admin_revision_seq'),updated_at=now(),updated_by=$5
        WHERE collection=$1 AND id=$2 AND revision=$3 AND $3>0 AND EXISTS (SELECT 1 FROM previous)
        RETURNING id,revision,data,created_at,updated_at,updated_by
      ), result AS (SELECT * FROM saved UNION ALL SELECT * FROM changed), logged AS (
        INSERT INTO ft_admin_audit(id,actor_id,actor_email,action,resource,before_value,after_value)
        SELECT $6,$5,$7,CASE WHEN $3=0 THEN 'create' ELSE 'update' END,$1||'/'||$2,(SELECT data FROM previous),$4::jsonb FROM result
      ) SELECT * FROM result`,
        [
          collection,
          id,
          revision,
          JSON.stringify(data),
          user.id,
          randomUUID(),
          user.email,
        ],
      )
      if (!rows.length)
        fail(
          'Innholdet er endret av en annen. Hent siste versjon før du lagrer.',
          409,
        )
      return rows[0]
    },
    async remove(user, collection, id, revision) {
      requireRole(user, collections[collection] || [])
      validId(id)
      const rows = await sql.query(
        `WITH removed AS (
        DELETE FROM ft_admin_records WHERE collection=$1 AND id=$2 AND revision=$3 RETURNING data
      ), logged AS (
        INSERT INTO ft_admin_audit(id,actor_id,actor_email,action,resource,before_value)
        SELECT $4,$5,$6,'delete',$1||'/'||$2,data FROM removed
      ) SELECT data FROM removed`,
        [collection, id, revision, randomUUID(), user.id, user.email],
      )
      if (!rows.length)
        fail('Innholdet er endret eller slettet. Hent siste versjon.', 409)
      return { removed: true }
    },
  }
}
