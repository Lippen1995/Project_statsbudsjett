import { adminEmail } from './auth.mjs'
import {
  audit,
  enumValue,
  fail,
  requireRole,
  roleOf,
  roles,
  text,
} from './core.mjs'

export function accountService({ sql, auth, mail }) {
  return {
    async list(user) {
      requireRole(user)
      return sql.query(
        'SELECT id,name,email,role,banned,"twoFactorEnabled","createdAt" FROM ft_admin_user ORDER BY "createdAt"',
      )
    },
    async profile(session) {
      const sessions = await sql.query(
        'SELECT id,"createdAt","updatedAt","expiresAt","userAgent" FROM ft_admin_session WHERE "userId"=$1 AND "expiresAt">now() ORDER BY "updatedAt" DESC',
        [session.user.id],
      )
      return {
        user: {
          id: session.user.id,
          email: session.user.email,
          name: session.user.name,
          role: roleOf(session.user),
          twoFactorEnabled: Boolean(session.user.twoFactorEnabled),
        },
        sessions: sessions.map((s) => ({
          ...s,
          current: s.id === session.session.id,
        })),
        recoveryEmailReady: Boolean(mail?.ready),
      }
    },
    async invite(user, value, headers) {
      requireRole(user)
      if (!mail?.ready)
        fail('E-posttjenesten må kobles til før invitasjoner kan sendes.', 503)
      const email = text(value.email, 5, 254).toLowerCase()
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
        fail('Ugyldig e-postadresse.')
      const role = enumValue(value.role, roles)
      const [existing] = await sql.query(
        'SELECT id,email,role,banned FROM ft_admin_user WHERE lower(email)=$1',
        [email],
      )
      if (existing && (existing.banned || existing.role !== role))
        fail(
          'Kontoen finnes allerede med en annen tilgang. Endre rollen i brukerlisten før du sender invitasjon på nytt.',
          409,
        )
      const created = existing
        ? { user: existing }
        : await auth.api.createUser({
            headers,
            body: { email, name: text(value.name, 2, 100), role },
          })
      await audit(
        sql,
        user,
        existing ? 'reinvite' : 'invite',
        'users/' + created.user.id,
        null,
        { email, role },
      )
      await auth.api.requestPasswordReset({
        headers,
        body: { email, redirectTo: '/admin/#tilbakestill-passord' },
      })
      return { invited: true, user: { id: created.user.id, email, role } }
    },
    async update(user, value, headers) {
      requireRole(user)
      const [target] = await sql.query(
        'SELECT id,email,role,banned FROM ft_admin_user WHERE id=$1',
        [text(value.id, 1, 100)],
      )
      if (!target) fail('Kontoen finnes ikke.', 404)
      const role = enumValue(value.role, roles)
      const banned = Boolean(value.banned)
      if (target.email.toLowerCase() === adminEmail || target.id === user.id) {
        if (role !== 'admin' || banned)
          fail(
            'Eierkontoen og din egen administratortilgang kan ikke deaktiveres her.',
          )
      }
      await auth.api.setRole({ headers, body: { userId: target.id, role } })
      if (banned !== target.banned) {
        if (banned)
          await auth.api.banUser({
            headers,
            body: {
              userId: target.id,
              banReason: 'Deaktivert av administrator.',
            },
          })
        else await auth.api.unbanUser({ headers, body: { userId: target.id } })
      }
      await audit(sql, user, 'access', 'users/' + target.id, target, {
        role,
        banned,
      })
      return { updated: true }
    },
    async revoke(session, value) {
      const id = text(value.id, 1, 100)
      const [target] = await sql.query(
        'SELECT id,"userId" FROM ft_admin_session WHERE id=$1',
        [id],
      )
      if (!target) fail('Økten finnes ikke lenger.', 404)
      if (target.userId !== session.user.id) requireRole(session.user)
      await sql.query('DELETE FROM ft_admin_session WHERE id=$1', [id])
      await audit(sql, session.user, 'revoke-session', 'sessions/' + id)
      return { revoked: true, current: id === session.session.id }
    },
    async log(user, { q = '', action = '', limit = 100 } = {}) {
      requireRole(user)
      return sql.query(
        `SELECT id,actor_email,action,resource,created_at,before_value,after_value FROM ft_admin_audit
        WHERE (actor_email||' '||resource||' '||action) ILIKE $1 AND ($2='' OR action=$2)
        ORDER BY created_at DESC LIMIT $3`,
        [
          '%' + text(q, 0, 120) + '%',
          text(action, 0, 60),
          Math.min(200, limit),
        ],
      )
    },
  }
}
