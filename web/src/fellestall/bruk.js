import { useEffect, useState } from 'react'

/**
 * Toner inn seksjoner første gang de kommer inn i viewporten.
 *
 * Observatøren kobles på nye [data-avslor]-elementer etter hver render, siden
 * seksjonene monteres etter hvert som data kommer inn. Uten
 * IntersectionObserver vises alt med én gang.
 */
export function useAvslor(avhengighet) {
  useEffect(() => {
    const elementer = document.querySelectorAll('[data-avslor]:not(.synlig)')
    if (!elementer.length) return

    if (!('IntersectionObserver' in window)) {
      elementer.forEach((e) => e.classList.add('synlig'))
      return
    }

    const obs = new IntersectionObserver(
      (poster) =>
        poster.forEach((p) => {
          if (p.isIntersecting) {
            p.target.classList.add('synlig')
            obs.unobserve(p.target)
          }
        }),
      { threshold: 0.06, rootMargin: '0px 0px -6% 0px' }
    )
    elementer.forEach((e) => obs.observe(e))
    return () => obs.disconnect()
  }, [avhengighet])
}

/**
 * Hvilken seksjon som står øverst i viewporten, for å markere den i menyen.
 * Leses av på rAF, ikke på hver scroll-hendelse.
 */
export function useAktivSeksjon(ider) {
  const [aktiv, setAktiv] = useState('')

  useEffect(() => {
    let venter = false
    const les = () => {
      let ny = ''
      for (const id of ider) {
        const el = document.getElementById(id)
        if (el && el.getBoundingClientRect().top <= 140) ny = id
      }
      setAktiv((forrige) => (forrige === ny ? forrige : ny))
    }
    const paaScroll = () => {
      if (venter) return
      venter = true
      requestAnimationFrame(() => { venter = false; les() })
    }
    window.addEventListener('scroll', paaScroll, { passive: true })
    les()
    return () => window.removeEventListener('scroll', paaScroll)
  }, [ider])

  return aktiv
}
