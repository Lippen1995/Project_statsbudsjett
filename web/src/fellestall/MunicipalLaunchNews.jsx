import React, { useEffect, useState } from 'react'
import {
  MUNICIPAL_LAUNCH_END,
  MUNICIPAL_LAUNCH_START,
  isMunicipalLaunchNewsVisible,
} from './launchNews.js'

const MAX_BROWSER_TIMEOUT = 2_147_000_000

export function useMunicipalLaunchNewsVisibility() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    let timeoutId

    const syncVisibility = () => {
      const now = Date.now()
      setVisible(isMunicipalLaunchNewsVisible(now))

      const start = Date.parse(MUNICIPAL_LAUNCH_START)
      const end = Date.parse(MUNICIPAL_LAUNCH_END)
      const nextBoundary = now < start ? start : now < end ? end : null

      if (nextBoundary !== null) {
        const delay = Math.min(Math.max(nextBoundary - now + 50, 50), MAX_BROWSER_TIMEOUT)
        timeoutId = window.setTimeout(syncVisibility, delay)
      }
    }

    syncVisibility()
    return () => window.clearTimeout(timeoutId)
  }, [])

  return visible
}

export function MunicipalLaunchBadge() {
  return <span className="ft-kommuneny-merke">NY!</span>
}

export function MunicipalLaunchAnnouncement() {
  return (
    <a className="ft-kommunenyhet" href="#kommuner">
      <span className="ft-stikkord">Nyhet</span>
      <strong>Se regnskapet til kommunen din</strong>
      <span className="ft-kommunenyhet-tekst">
        Utforsk inntekter, utgifter og utvikling for norske kommuner og fylker.
      </span>
      <span className="ft-kommunenyhet-lenke">
        Åpne kommunemodulen <span aria-hidden="true">→</span>
      </span>
    </a>
  )
}
