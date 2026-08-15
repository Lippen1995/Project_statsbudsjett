import React, { useEffect, useState } from 'react'
import { loadKostraBoundaries, loadKostraIndex } from '../lib/kostra'
import KostraKart from './KostraKart'
import KostraDetalj from './KostraDetalj'
import { parseKostraRoute } from './model'
import './kostra.css'

export default function Kostra({ hash }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const route = parseKostraRoute(hash)

  useEffect(() => {
    Promise.all([loadKostraIndex(), loadKostraBoundaries()])
      .then(([index, boundaries]) => {
        if (!index || !boundaries) setError('KOSTRA-data er ikke publisert ennå.')
        else setData({ index, boundaries })
      })
      .catch((e) => setError(e.message))
  }, [])

  useEffect(() => {
    if (!hash.startsWith('#kostra')) return
    requestAnimationFrame(() => {
      document.getElementById('kommuner')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
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
      ) : route.page === 'detail' ? (
        <KostraDetalj index={data.index} kind={route.kind} code={route.code} embedded />
      ) : (
        <KostraKart index={data.index} boundaries={data.boundaries} countyCode={route.countyCode} embedded />
      )}
      <div className="ko-kildelinje">
        KOSTRA-data fra SSB · Geografi fra Kartverket · CC BY 4.0 · Ingen direkte kall til SSB fra nettleseren
      </div>
    </div>
  )
}
