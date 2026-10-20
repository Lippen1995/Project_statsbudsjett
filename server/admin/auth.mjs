import { randomUUID } from 'node:crypto'
import { betterAuth } from 'better-auth'
import { twoFactor } from 'better-auth/plugins/two-factor'
import { admin } from 'better-auth/plugins/admin'
import { adminAc, userAc } from 'better-auth/plugins/admin/access'
import pg from 'pg'

export const adminEmail = 'info@fjordinsight.com'

export function createAuth(
  database,
  {
    secret = process.env.BETTER_AUTH_SECRET,
    baseURL = process.env.BETTER_AUTH_URL || 'https://fellestall.no',
    sendResetPassword,
  } = {},
) {
  if (!secret || secret.length < 32)
    throw Error('BETTER_AUTH_SECRET må være konfigurert på serveren')
  return betterAuth({
    database,
    secret,
    baseURL,
    trustedOrigins: [baseURL],
    emailAndPassword: {
      enabled: true,
      disableSignUp: true,
      minPasswordLength: 12,
      ...(sendResetPassword
        ? { sendResetPassword, revokeSessionsOnPasswordReset: true }
        : {}),
    },
    databaseHooks: {
      session: {
        create: {
          after: async (session) => {
            const result = await database.query(
              'SELECT email FROM ft_admin_user WHERE id=$1',
              [session.userId],
            )
            if (result.rows[0])
              await database.query(
                'INSERT INTO ft_admin_audit(id,actor_id,actor_email,action,resource) VALUES($1,$2,$3,$4,$5)',
                [
                  randomUUID(),
                  session.userId,
                  result.rows[0].email,
                  'sign-in',
                  'security/session',
                ],
              )
          },
        },
      },
      account: {
        update: {
          after: async (account) => {
            if (account.providerId === 'credential') {
              const result = await database.query(
                'SELECT email FROM ft_admin_user WHERE id=$1',
                [account.userId],
              )
              if (result.rows[0])
                await database.query(
                  'INSERT INTO ft_admin_audit(id,actor_id,actor_email,action,resource) VALUES($1,$2,$3,$4,$5)',
                  [
                    randomUUID(),
                    account.userId,
                    result.rows[0].email,
                    'credential-updated',
                    'security/password',
                  ],
                )
            }
          },
        },
      },
    },
    user: { modelName: 'ft_admin_user' },
    account: { modelName: 'ft_admin_account' },
    session: {
      modelName: 'ft_admin_session',
      expiresIn: 60 * 60 * 8,
      updateAge: 60 * 60,
    },
    verification: { modelName: 'ft_admin_verification' },
    rateLimit: {
      enabled: true,
      storage: 'database',
      modelName: 'ft_admin_rate_limit',
      window: 60,
      max: 30,
      customRules: { '/sign-in/email': { window: 300, max: 5 } },
    },
    advanced: {
      cookiePrefix: 'fellestall-admin',
      ipAddress: { ipAddressHeaders: ['x-vercel-forwarded-for'] },
    },
    plugins: [
      twoFactor({
        issuer: 'Fellestall',
        twoFactorTable: 'ft_admin_two_factor',
      }),
      admin({
        defaultRole: 'viewer',
        adminRoles: ['admin'],
        roles: { admin: adminAc, editor: userAc, viewer: userAc },
      }),
    ],
  })
}

export function authPool() {
  if (!process.env.DATABASE_URL) throw Error('DATABASE_URL mangler på serveren')
  return new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    max: 3,
    connectionTimeoutMillis: 10000,
    query_timeout: 8000,
  })
}
