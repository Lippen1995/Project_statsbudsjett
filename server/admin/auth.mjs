import { betterAuth } from 'better-auth'
import pg from 'pg'

export const adminEmail = 'info@fjordinsight.com'

export function createAuth(database, { secret = process.env.BETTER_AUTH_SECRET, baseURL = process.env.BETTER_AUTH_URL || 'https://fellestall.no' } = {}) {
  if (!secret || secret.length < 32) throw Error('BETTER_AUTH_SECRET må være konfigurert på serveren')
  return betterAuth({
    database,
    secret,
    baseURL,
    trustedOrigins: [baseURL],
    emailAndPassword: { enabled: true, disableSignUp: true, minPasswordLength: 12 },
    user: { modelName: 'ft_admin_user' },
    account: { modelName: 'ft_admin_account' },
    session: { modelName: 'ft_admin_session', expiresIn: 60 * 60 * 8, updateAge: 60 * 60 },
    verification: { modelName: 'ft_admin_verification' },
    rateLimit: { enabled: true, storage: 'database', modelName: 'ft_admin_rate_limit', window: 60, max: 30,
      customRules: { '/sign-in/email': { window: 300, max: 5 } } },
    advanced: { cookiePrefix: 'fellestall-admin', ipAddress: { ipAddressHeaders: ['x-vercel-forwarded-for'] } },
  })
}

export function authPool() {
  if (!process.env.DATABASE_URL) throw Error('DATABASE_URL mangler på serveren')
  return new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 3, connectionTimeoutMillis: 10000 })
}
