import React, { useState, useEffect, useCallback } from 'react'
import {
  loadAll, hentDetaljer, MODUSER,
  lesHashTilstand, skrivHashTilstand, finnStiFraIds,
} from './lib/data'
import Toppkontroll from './components/Toppkontroll'
import BalanseTopp from './components/BalanseTopp'
import Drilldown from './components/Drilldown'
import Historikkgraf from './components/Historikkgraf'
import Virksomheter from './components/Virksomheter'
import OmTallene from './components/OmTallene'
import Footer from './components/Footer'
import './App.css'

export default function App() {
  const [data, setData] = useState(null)
  const [feil, setFeil] = useState(null)
  const [side, setSide] = useState('utgifter')
  const [valgtAar, setValgtAar] = useState(null)
  const [modus, setModus] = useState('lopende')
  const [skjulFin, setSkjulFin] = useState(true)
  const [sti, setSti] = useState([])
  const [fokusNode, setFokusNode] = useState(null)
  const [pinnedNode, setPinnedNode] = useState(null)   // sammenligningsserie
  const [detaljer, setDetaljer] = useState({})          // nodeId -> {artskonto, virksomheter}
  const [visOmTallene, setVisOmTallene] = useState(false)

  // --- Init: last data, gjenopprett tilstand fra URL-hash ---
  useEffect(() => {
    loadAll()
      .then(d => {
        setData(d)
        const hash = lesHashTilstand()
        const hierarki = hash?.side === 'inntekter' ? d.inntekter : d.utgifter
        if (hash?.side) setSide(hash.side)
        setValgtAar(hash?.aar ?? d.meta.siste_regnskap_aar)
        if (hash?.modus && MODUSER.some(m => m.id === hash.modus)) setModus(hash.modus)
        if (hash?.skjulFin != null) setSkjulFin(hash.skjulFin)
        if (hash?.stiIds?.length) {
          const gjenopprettet = finnStiFraIds(hierarki, hash.stiIds)
          setSti(gjenopprettet)
          setFokusNode(gjenopprettet[gjenopprettet.length - 1] ?? null)
        }
      })
      .catch(e => setFeil(e.message))
  }, [])

  // --- Synk tilstand → URL-hash (delbare lenker) ---
  useEffect(() => {
    if (!data || !valgtAar) return
    skrivHashTilstand({ side, aar: valgtAar, modus, skjulFin, sti })
  }, [data, side, valgtAar, modus, skjulFin, sti])

  // --- Lazy-last detaljer (artskonto/virksomheter) når fokus er en post ---
  useEffect(() => {
    const node = fokusNode
    if (!node || node.niva !== 'post' || detaljer[node.id] !== undefined) return
    hentDetaljer(node.id).then(deptDetaljer => {
      setDetaljer(prev => ({ ...prev, [node.id]: deptDetaljer?.[node.id] ?? null }))
    })
  }, [fokusNode, detaljer])

  const handleDrill = useCallback((node) => {
    setSti(prev => [...prev, node])
    setFokusNode(node)
  }, [])

  const handleFokus = useCallback((node) => setFokusNode(node), [])

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

  const handleNaviger = useCallback((stiNoder) => {
    setSti(stiNoder)
    setFokusNode(stiNoder[stiNoder.length - 1] ?? null)
  }, [])

  if (feil) return (
    <div className="feil-melding">
      <h2>Datafeil</h2>
      <p>{feil}</p>
      <p className="hint">Kjør <code>npm run etl</code> for å laste ned data fra DFØ og SSB.</p>
    </div>
  )

  if (!data) return (
    <div className="laster"><div className="spinner" /><p>Laster data…</p></div>
  )

  const hierarki = side === 'utgifter' ? data.utgifter : data.inntekter
  const { meta, befolkning, kpi, bnp } = data
  const modusCtx = { kpi, bnp, befolkning, basisAar: meta.kpi_basisaar ?? meta.siste_regnskap_aar }

  const tilgjengeligeModuser = MODUSER.filter(m =>
    !m.krever || (m.krever === 'kpi' && kpi) || (m.krever === 'bnp' && bnp)
      || (m.krever === 'befolkning' && befolkning)
  )

  const fokusDetaljer = fokusNode ? detaljer[fokusNode.id] : null

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
            setSide={s => { setSide(s); setSti([]); setFokusNode(null); setPinnedNode(null) }}
            valgtAar={valgtAar}
            setValgtAar={setValgtAar}
            aarMin={meta.regnskap_aar[0]}
            aarMax={meta.siste_budsjett_aar}
            modus={modus}
            setModus={setModus}
            moduser={tilgjengeligeModuser}
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
          modus={modus}
          modusCtx={modusCtx}
          skjulFin={skjulFin}
          meta={meta}
        />

        <div className="midt-grid">
          <section className="drilldown-seksjon panel">
            <Drilldown
              hierarki={hierarki}
              side={side}
              valgtAar={valgtAar}
              modus={modus}
              modusCtx={modusCtx}
              skjulFin={skjulFin}
              sti={sti}
              fokusNode={fokusNode}
              fokusDetaljer={fokusDetaljer}
              onDrill={handleDrill}
              onFokus={handleFokus}
              onBreadcrumb={handleBreadcrumb}
              onToppnivaa={handleToppnivaa}
              onNaviger={handleNaviger}
            />
          </section>

          <aside className="side-seksjon">
            <section className="panel historikk-panel">
              <Historikkgraf
                node={fokusNode ?? { id: 'rot', navn: side === 'utgifter' ? 'Alle utgifter' : 'Alle inntekter', serier: byggRotSerier(hierarki, meta.regnskap_aar.concat(meta.siste_budsjett_aar !== meta.siste_regnskap_aar ? [meta.siste_budsjett_aar] : [])) }}
                years={meta.regnskap_aar}
                budsjettAar={meta.siste_budsjett_aar}
                modus={modus}
                modusCtx={modusCtx}
                side={side}
                pinnedNode={pinnedNode}
                onPin={setPinnedNode}
              />
            </section>
            <Virksomheter
              node={fokusNode}
              detaljer={fokusDetaljer}
              valgtAar={valgtAar}
              side={side}
            />
          </aside>
        </div>
      </main>

      <Footer meta={meta} onVisOmTallene={() => setVisOmTallene(true)} />
      {visOmTallene && <OmTallene onLukk={() => setVisOmTallene(false)} meta={meta} />}
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
