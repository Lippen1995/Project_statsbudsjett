import { useEffect, useState } from 'react'

export async function api(path, options = {}) {
  const { skipSessionExpiry, ...fetchOptions } = options
  const response = await fetch(path, {
    credentials: 'same-origin',
    cache: 'no-store',
    ...fetchOptions,
    headers: { 'Content-Type': 'application/json', ...options.headers },
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    if (
      response.status === 401 &&
      !skipSessionExpiry &&
      path.startsWith('/api/admin/')
    )
      window.dispatchEvent(new Event('admin-session-expired'))
    const known = {
      INVALID_CODE:
        'Koden er ugyldig. Kontroller autentiseringsappen og prøv en ny kode.',
      INVALID_PASSWORD: 'Passordet er feil.',
      INVALID_TOKEN: 'Lenken er brukt eller utløpt. Be om en ny lenke.',
    }
    throw Object.assign(
      Error(
        known[data.code] ||
          data.error?.message ||
          (typeof data.error === 'string'
            ? data.error
            : data.message || 'Tjenesten kunne ikke nås. Prøv igjen.'),
      ),
      { status: response.status },
    )
  }
  return data
}
export function useResource(path) {
  const [state, setState] = useState({ loading: true })
  const [revision, reload] = useState(0)
  useEffect(() => {
    if (!path) {
      setState({ data: null, loading: false })
      return
    }
    const controller = new AbortController()
    setState({ loading: true })
    api(path, { signal: controller.signal })
      .then((data) => setState({ data }))
      .catch((error) => {
        if (error.name !== 'AbortError') setState({ error: error.message })
      })
    return () => controller.abort()
  }, [path, revision])
  return { ...state, reload: () => reload((n) => n + 1) }
}
