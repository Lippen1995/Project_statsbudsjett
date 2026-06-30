import React, { useState, useEffect, useCallback } from 'react'
import { loadAll } from './lib/data'
import Toppkontroll from './components/Toppkontroll'
import BalanseTopp from './components/BalanseTopp'
import Drilldown from './components/Drilldown'
import Historikkgraf from './components/Historikkgraf'
import ArtskontoPivot from './components/ArtskontoPivot'
import Footer from './components/Footer'
import './App.css'

export default function App() {
  const [data, setData] = useState(null)
  const [feil, setFeil] = useState(null)
  const [side, setSide] = useState('utgifter')   // 'utgifter' | 'inntekter'
  const [valgtAar, setValgtAar] = useState(null)
  const [perPerson, setPerPerson] = useState(false)
  const [skjulFin, setSkjulFin] = useState(true)
  const [sti, setSti] = useState([])             // breadcrumb-stack
  const [fokusNode, setFokusNode] = useState(null)

  useEffect(() => {
    loadAll()
      .then(d => {
        setData(d)
        setValgtAar(d.meta.siste_regnskap_aar)
      })
      .catch(e => setFeil(e.message))
  }, [])

  const handleDrill = useCallback((node, parent) => {
    setSti(prev => {
      if (parent) return [...prev, node]
      return [node]
    })
    setFokusNode(node)
  }, [])

  const handleBreadcrumb = useCallback((idx) => {
    setSti(prev => {
      const next = prev.slice(0, idx + 1)
      setFokusNode(next[next.length - 1] ?? null)
      return next
    })
  }, [])

  const handleToppnivaa = useCallback(() => {
    setSti([])
    setFokusNode(null)
  }, [])

  if (feil) return (
    <div className="feil-melding">
      <h2>Datafeil</h2>
      <p>{feil}</p>
      <p className="hint">
        Kjør <code>npm run etl</code> for å laste ned data fra DFØ og SSB.
      </p>
    </div>
  )

  if (!data) return (
    <div className="laster">
      <div className="spinner" />
      <p>Laster data…</p>
    </div>
  )

  const hierarki = side === 'utgifter' ? data.utgifter : data.inntekter
  const { meta, befolkning } = data

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-inner">
          <div className="header-tittel">
            <span className="header-emblem">🏛</span>
            <div>
              <h1>Statens regnskap</h1>
              <p className="header-undertittel">
                Brutto inntekter og utgifter · {meta.regnskap_aar[0]}–{meta.siste_regnskap_aar}
              </p>
            </div>
          </div>
          <Toppkontroll
            side={side}
            setSide={s => { setSide(s); setSti([]); setFokusNode(null) }}
            valgtAar={valgtAar}
            setValgtAar={setValgtAar}
            aarMin={meta.regnskap_aar[0]}
            aarMax={meta.siste_budsjett_aar}
            perPerson={perPerson}
            setPerPerson={setPerPerson}
            skjulFin={skjulFin}
            setSkjulFin={setSkjulFin}
          />
        </div>
      </header>

      <main className="app-main">
        <BalanseTopp
          utgifter={data.utgifter}
          inntekter={data.inntekter}
          valgtAar={valgtAar}
          perPerson={perPerson}
          befolkning={befolkning}
          skjulFin={skjulFin}
          meta={meta}
        />

        <div className="midt-grid">
          <section className="drilldown-seksjon panel">
            <Drilldown
              hierarki={hierarki}
              side={side}
              valgtAar={valgtAar}
              perPerson={perPerson}
              befolkning={befolkning}
              skjulFin={skjulFin}
              sti={sti}
              fokusNode={fokusNode}
              onDrill={handleDrill}
              onBreadcrumb={handleBreadcrumb}
              onToppnivaa={handleToppnivaa}
            />
          </section>

          <aside className="side-seksjon">
            <section className="panel historikk-panel">
              <Historikkgraf
                node={fokusNode ?? { id: 'rot', navn: side === 'utgifter' ? 'Alle utgifter' : 'Alle inntekter', serier: byggRotSerier(hierarki, meta.regnskap_aar.concat(meta.siste_budsjett_aar !== meta.siste_regnskap_aar ? [meta.siste_budsjett_aar] : [])) }}
                years={meta.regnskap_aar}
                budsjettAar={meta.siste_budsjett_aar}
                perPerson={perPerson}
                befolkning={befolkning}
                side={side}
              />
            </section>
            <section className="panel artskonto-panel">
              <ArtskontoPivot
                node={fokusNode}
                valgtAar={valgtAar}
                side={side}
              />
            </section>
          </aside>
        </div>
      </main>

      <Footer meta={meta} />
    </div>
  )
}

function byggRotSerier(hierarki, years) {
  const serier = {}
  for (const y of years) {
    const regnskap = hierarki.reduce((s, n) => s + (n.serier?.[y]?.regnskap ?? 0), 0)
    const saldert = hierarki.reduce((s, n) => s + (n.serier?.[y]?.saldert ?? 0), 0)
    const revidert = hierarki.reduce((s, n) => s + (n.serier?.[y]?.revidert ?? 0), 0)
    serier[y] = {
      regnskap: regnskap || null,
      saldert: saldert || null,
      revidert: revidert || null,
    }
  }
  return serier
}
