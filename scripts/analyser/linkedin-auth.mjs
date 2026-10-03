export async function linkedInToken(config = process.env) {
  const refresh = config.LINKEDIN_REFRESH_TOKEN
  if (refresh) {
    if (!config.LINKEDIN_CLIENT_ID || !config.LINKEDIN_CLIENT_SECRET)
      throw Error('OAuth-fornyelse krever LINKEDIN_CLIENT_ID og LINKEDIN_CLIENT_SECRET')
    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refresh,
      client_id: config.LINKEDIN_CLIENT_ID,
      client_secret: config.LINKEDIN_CLIENT_SECRET,
    })
    const response = await fetch('https://www.linkedin.com/oauth/v2/accessToken', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
      signal: AbortSignal.timeout(30000),
    })
    if (!response.ok)
      throw Error(
        `LinkedIn OAuth-fornyelse feilet: HTTP ${response.status}. Ingen innlegg er sendt`,
      )
    const result = await response.json()
    if (!result.access_token) throw Error('LinkedIn returnerte ingen tilgang etter OAuth-fornyelse')
    return result.access_token
  }
  if (!config.LINKEDIN_ACCESS_TOKEN) throw Error('LinkedIn OAuth-tilgang mangler')
  return config.LINKEDIN_ACCESS_TOKEN
}
