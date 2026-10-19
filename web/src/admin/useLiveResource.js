import { useEffect, useState } from 'react'
import { api } from './api.js'

export function useLiveResource(path, interval = 15000) {
  const [state, setState] = useState({ loading: true, data: null, error: '' })
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    let disposed = false, timer, controller, failures = 0
    async function refresh() {
      clearTimeout(timer)
      if (disposed || document.visibilityState === 'hidden') return
      controller?.abort()
      controller = new AbortController()
      try {
        const data = await api(path, { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(12000)]) })
        if (disposed) return
        failures = 0; setState({ loading: false, data, error: '' })
      } catch (error) {
        if (disposed || error.name === 'AbortError') return
        failures++
        setState(previous => ({ ...previous, loading: false, error: error.message }))
      }
      if (!disposed && document.visibilityState !== 'hidden') timer = setTimeout(refresh, Math.min(interval * 2 ** failures, 120000))
    }
    function visibility() {
      clearTimeout(timer)
      controller?.abort()
      if (document.visibilityState !== 'hidden') refresh()
    }
    refresh(); document.addEventListener('visibilitychange', visibility)
    return () => { disposed = true; clearTimeout(timer); controller?.abort(); document.removeEventListener('visibilitychange', visibility) }
  }, [path, interval, revision])
  return { ...state, reload: () => setRevision(value => value + 1) }
}
