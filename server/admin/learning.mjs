import { audit, fail, recordStore, requireRole, text } from './core.mjs'

export function learningService({ sql, github }) {
  return {
    async get() {
      const [file, feedback, proposals] = await Promise.all([
        github.read('preferences'),
        recordStore(sql).list('feedback'),
        recordStore(sql).list('rules'),
      ])
      return {
        preferences: JSON.parse(file.content),
        sha: file.sha,
        feedback,
        proposals,
      }
    },
    async apply(user, value) {
      requireRole(user)
      const file = await github.read('preferences')
      if (file.sha !== value.sha)
        fail('Reglene er endret av en annen. Hent siste versjon.', 409)
      const preferences = JSON.parse(file.content),
        before = structuredClone(preferences.rules)
      if (value.action === 'approve') {
        const [record] = await sql.query(
          "SELECT * FROM ft_admin_records WHERE collection='rules' AND id=$1",
          [text(value.id, 1, 100)],
        )
        if (
          !record ||
          record.revision !== value.revision ||
          record.data.status !== 'proposed'
        )
          fail('Regelforslaget er endret eller allerede behandlet.', 409)
        const rule = {
          id: 'ADMIN-' + record.id,
          status: 'active',
          scope:
            record.data.scope === 'all'
              ? 'article-and-linkedin'
              : record.data.scope,
          rule: record.data.rule,
          provenance: {
            kind: 'admin-approved-feedback',
            source: record.data.provenance,
            feedbackId: record.data.feedbackId || null,
            approvedAt: new Date().toISOString(),
          },
        }
        if (preferences.rules.some((r) => r.id === rule.id))
          fail('Regelen er allerede registrert.', 409)
        preferences.rules.push(rule)
      } else {
        const rule = preferences.rules.find((r) => r.id === value.id)
        if (!rule) fail('Regelen finnes ikke.', 404)
        if (!['archive', 'restore'].includes(value.action))
          fail('Ugyldig regelhandling.')
        rule.status = value.action === 'archive' ? 'archived' : 'active'
      }
      preferences.updatedAt = new Date().toISOString()
      preferences.feedbackEvents ||= []
      preferences.feedbackEvents.push({
        id: 'ADMIN-' + Date.now(),
        at: new Date().toISOString(),
        kind: value.action,
        ruleId: value.id,
        reason: text(value.reason, 5, 1000),
      })
      const result = await github.save({
        id: 'preferences',
        sha: file.sha,
        content: JSON.stringify(preferences, null, 2) + '\n',
        reason: 'Godkjent redaksjonell regelendring fra admin',
      })
      if (value.action === 'approve')
        await sql.query(
          "UPDATE ft_admin_records SET data=jsonb_set(data,'{status}','\"active\"'::jsonb),revision=nextval('ft_admin_revision_seq'),updated_at=now(),updated_by=$1 WHERE collection='rules' AND id=$2 AND revision=$3",
          [user.id, value.id, value.revision],
        )
      await audit(
        sql,
        user,
        'learning-' + value.action,
        'learning/' + value.id,
        before,
        preferences.rules,
      )
      return { ...result, applied: true }
    },
    async version(id, commit) {
      if (!/^[a-f0-9]{40}$/.test(commit || '')) fail('Velg en gyldig versjon.')
      const current = await github.read(id)
      const old = await github.readFile(current.path, commit)
      if (!old) fail('Filen finnes ikke i denne versjonen.', 404)
      return { current, previous: old, commit }
    },
    async restore(user, value) {
      requireRole(user)
      if (value.confirm !== 'GJENOPPRETT')
        fail('Skriv GJENOPPRETT for å bekrefte.')
      const { current, previous } = await this.version(value.id, value.commit)
      if (current.sha !== value.sha)
        fail('Arbeidsfilen er endret. Hent siste versjon.', 409)
      const reason = text(value.reason, 5, 300)
      const result = await github.save({
        id: value.id,
        sha: current.sha,
        content: previous.content,
        reason,
      })
      await audit(
        sql,
        user,
        'restore-instructions',
        'sven/' + value.id,
        { sha: current.sha },
        { ...result, sourceCommit: value.commit, reason },
      )
      return { ...result, restored: true }
    },
  }
}
