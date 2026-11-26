import { createHmac } from 'node:crypto'
import { betterAuth } from 'better-auth'

export function customerSecret(environment = process.env) {
  const secret = environment.FELLESTALL_CUSTOMER_AUTH_SECRET || environment.BETTER_AUTH_SECRET
  if (!secret || secret.length < 32) throw Error('Kundeinnloggingen mangler serverhemmelighet.')
  return createHmac('sha256', secret).update('fellestall-customer-auth-v1').digest('hex')
}

export function customerOrigin(environment = process.env) {
  const value = environment.FELLESTALL_CUSTOMER_ORIGIN ||
    (environment.VERCEL_ENV === 'preview' && environment.VERCEL_URL ? 'https://' + environment.VERCEL_URL : 'https://fellestall.no')
  const url = new URL(value)
  if (url.origin !== value || !(url.protocol === 'https:' || url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname))) {
    throw Error('Kundeinnloggingen krever en gyldig origin.')
  }
  return url.origin
}

export function createCustomerAuth(database, { secret = customerSecret(), origin = customerOrigin(), mail } = {}) {
  return betterAuth({
    database, secret, baseURL: origin, basePath: '/api/customer/auth', trustedOrigins: [origin],
    emailAndPassword: {
      enabled: true, minPasswordLength: 12, maxPasswordLength: 128,
      requireEmailVerification: true, autoSignIn: false, revokeSessionsOnPasswordReset: true,
      resetPasswordTokenExpiresIn: 3600,
      sendResetPassword: value => mail.reset(value),
    },
    emailVerification: {
      sendOnSignUp: true, autoSignInAfterVerification: false, expiresIn: 3600,
      sendVerificationEmail: value => mail.verify(value),
    },
    user: { modelName: 'ft_customer_user' },
    account: { modelName: 'ft_customer_account' },
    session: {
      modelName: 'ft_customer_session', expiresIn: 7 * 86400, updateAge: 3600,
      // Every protected request checks the database, including expired/revoked sessions.
      cookieCache: { enabled: false },
    },
    verification: { modelName: 'ft_customer_verification' },
    rateLimit: {
      enabled: true, storage: 'database', modelName: 'ft_customer_rate_limit', window: 60, max: 30,
      customRules: {
        '/sign-in/email': { window: 300, max: 5 },
        '/sign-up/email': { window: 300, max: 5 },
        '/request-password-reset': { window: 300, max: 3 },
      },
    },
    advanced: { cookiePrefix: 'fellestall-customer', ipAddress: { ipAddressHeaders: ['x-vercel-forwarded-for'] } },
    databaseHooks: { user: { create: { after: async user => {
      await database.query('INSERT INTO ft_customer_access(user_id,plan) VALUES($1,\'free\') ON CONFLICT(user_id) DO NOTHING', [user.id])
    } } } },
  })
}
