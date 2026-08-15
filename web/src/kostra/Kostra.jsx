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

  return (
    <div className="ft ko">
      <a className="ft-hopp" href="#hovedinnhold">Hopp til innholdet</a>
      <div className="ft-layout">
        <aside className="ft-sidemeny ko-side" aria-label="KOSTRA-navigasjon">
          <a href="#" className="ft-merke-lenke">
            <div className="ft-logo">Fellestall<span>.no</span></div>
            <div className="ft-slagord">En oversikt over norske statsfinanser</div>
          </a>
          <nav className="ft-nav">
            <a className={`ft-navlenke ${route.page === 'map' && !route.countyCode ? 'aktiv' : ''}`} href="#kostra"><span className="ft-navnr num">01</span><span>Norgeskartet</span></a>
            <a className={`ft-navlenke ${route.page === 'map' && route.countyCode ? 'aktiv' : ''}`} href={route.countyCode ? `#kostra/fylke/${route.countyCode}` : '#kostra'}><span className="ft-navnr num">02</span><span>Fylker og kommuner</span></a>
            <a className={`ft-navlenke ${route.page === 'detail' ? 'aktiv' : ''}`} href={route.page === 'detail' ? hash : '#kostra'}><span className="ft-navnr num">03</span><span>Regnskap og sammenligning</span></a>
          </nav>
          <div className="ft-sidefot"><a href="#">← Statens finanser</a><a href="#kostra">KOSTRA-forsiden</a></div>
        </aside>
        <main className="ft-hovedspalte" id="hovedinnhold">
          <div className="ft-toppbar ko-toppbar">
            <div className="ft-toppbar-inner">
              <a href="#" className="ft-merke-lenke"><div className="ft-logo">Fellestall<span>.no</span></div></a>
              <nav className="ft-toppnav"><a href="#">Statens finanser</a><a className="aktiv" href="#kostra">Kommuner og fylker</a></nav>
            </div>
          </div>
          {error ? (
            <section className="ko-status"><h1>Kommune- og fylkesregnskap</h1><p>{error}</p><p>Kjør KOSTRA-importen for å bygge det lokale datagrunnlaget.</p><a href="#">Tilbake til statens finanser</a></section>
          ) : !data ? (
            <section className="ko-status"><div className="spinner" /><p>Laster KOSTRA-data…</p></section>
          ) : route.page === 'detail' ? (
            <KostraDetalj index={data.index} kind={route.kind} code={route.code} />
          ) : (
            <KostraKart index={data.index} boundaries={data.boundaries} countyCode={route.countyCode} />
          )}
        </main>
      </div>
      <footer className="ft-fot ko-fot">
        <div className="ft-fot-linje">
          <span>KOSTRA-data fra SSB · Geografi fra Kartverket · CC BY 4.0</span>
          <span>Ingen direkte kall til SSB fra nettleseren</span>
        </div>
      </footer>
    </div>
  )
}

