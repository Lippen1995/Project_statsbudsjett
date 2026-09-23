let indexPromise
let boundariesPromise
const details = new Map()

async function json(path, optional = false) {
  try {
    const response = await fetch(path)
    if (!response.ok) {
      if (optional && response.status === 404) return null
      throw new Error(`Klarte ikke laste KOSTRA-data (${response.status})`)
    }
    return response.json()
  } catch (error) {
    if (optional) return null
    throw error
  }
}

export function loadKostraIndex() {
  indexPromise ??= json('./data/kostra/index.json', true)
  return indexPromise
}

export function loadKostraBoundaries() {
  boundariesPromise ??= json('./data/kostra/boundaries.json', true)
  return boundariesPromise
}

export function loadKostraDetail(kind, code) {
  if (!['municipality', 'county'].includes(kind) || !/^\d{4}$/.test(code)) {
    return Promise.reject(new Error('Ugyldig region-id'))
  }
  const key = `${kind}-${code}`
  if (!details.has(key)) details.set(key, json(`./data/kostra/entities/${key}.json`, true))
  return details.get(key)
}
