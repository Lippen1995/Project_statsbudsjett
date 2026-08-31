import React, { useEffect, useRef, useState } from 'react'
import { loadKostraBoundaries, loadKostraIndex } from '../lib/kostra'
import KostraKart from './KostraKart'
import KostraDetalj from './KostraDetalj'
import { municipalityCodeStatus, parseKostraRoute, shouldScrollToKostra } from './model'
import './kostra.css'

export default function Kostra({ hash }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const previousHashRef = useRef(null)
  const route = parseKostraRoute(hash)
  const municipalityStatus = data && route.municipalityCode
    ? municipalityCodeStatus(data.index, route.municipalityCode)
    : null
  const historicalMunicipalityRoute = municipalityStatus === 'historical'
  const unknownMunicipalityRoute = municipalityStatus === 'unknown'

  useEffect(() => {
    Promise.all([loadKostraIndex(), loadKostraBoundaries()])
      .then(([index, boundaries]) => {
        if (!index || !boundaries) setError('KOSTRA-data er ikke publisert ennå.')
        else setData({ index, boundaries })
      })
      .catch((e) => setError(e.message))
  }, [])

  useEffect(() => {
    const previousHash = previousHashRef.current
    previousHashRef.current = hash
    const section = document.getElementById('kommuner')
    const rect = section?.getBoundingClientRect()
    const sectionVisible = Boolean(rect && rect.bottom > 0 && rect.top < window.innerHeight)
    if (!shouldScrollToKostra(previousHash, hash, sectionVisible)) return
    requestAnimationFrame(() => {
      if (window.location.hash === hash) {
        section?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }
    })
  }, [hash])

  return (
    <div id="kommuner" className="ko ko-integrert" data-avslor>
      {error ? (
        <section className="ko-status">
          <h2>Kommune- og fylkesregnskap</h2>
          <p>{error}</p>
          <p>Kjør KOSTRA-importen for å bygge det lokale datagrunnlaget.</p>
        </section>
      ) : !data ? (
        <section className="ko-status"><div className="spinner" /><p>Laster KOSTRA-data…</p></section>
      ) : unknownMunicipalityRoute ? (
        <section className="ko-status">
          <h2>Kommunen finnes ikke</h2>
          <p>Kommunekode {route.municipalityCode} finnes verken i dagens eller det historiske KOSTRA-grunnlaget.</p>
          <a href="#kostra">Tilbake til kartet</a>
        </section>
      ) : route.page === 'detail' || historicalMunicipalityRoute ? (
        <KostraDetalj
          index={data.index}
          kind={historicalMunicipalityRoute ? 'municipality' : route.kind}
          code={historicalMunicipalityRoute ? route.municipalityCode : route.code}
          embedded
        />
      ) : (
        <KostraKart
          index={data.index}
          boundaries={data.boundaries}
          countyCode={route.countyCode}
          selectedMunicipalityCode={route.municipalityCode}
          embedded
        />
      )}
      <div className="ko-kildelinje">
        KOSTRA-data fra SSB · Inntektsutjevning fra KDD · Geografi fra Kartverket · Ingen direkte datakall fra nettleseren
      </div>
    </div>
  )
}
