import React, { useEffect, useState } from 'react'
import MeetSven from './MeetSven.jsx'
import { GrowthComparison, RealExpenditureChart, AnnualChangeChart } from './AnalyseCharts'
import { annualChanges } from './insights'
import { graphPlan } from './chart-plan.js'
import SeriesChart from './SeriesChart.jsx'
import {
  BudgetTotals,
  BudgetChanges,
  BudgetEvidence,
  BudgetBridge,
  PoliticalEvidence,
  PartyPriorities,
} from './BudgetCharts.jsx'
import { analysisPath, displayDate, factText, filterAnalyses, number } from './model'

function Frame({ children }) {
  return (
    <div className="ft an">
      <a className="ft-hopp" href="#hovedinnhold">
        Hopp til innholdet
      </a>
      <header className="an-header">
        <a className="ft-merke-lenke" href="/" aria-label="Fellestall.no – forsiden">
          <div className="ft-logo">
            Fellestall<span>.no</span>
          </div>
          <div className="ft-slagord">En oversikt over norske statsfinanser</div>
        </a>
        <nav aria-label="Hovedinnhold">
          <a href="/">Utforsk tallene</a>
          <a href="/analyser/" aria-current="page">
            Analyser
          </a>
        </nav>
      </header>
      <main id="hovedinnhold" className="an-main">
        {children}
      </main>
      <footer className="an-footer">
        <div className="ft-logo">
          Fellestall<span>.no</span>
        </div>
        <p>Uavhengig, privat prosjekt – ikke tilknyttet noen offentlig etat.</p>
        <nav aria-label="Om siden">
          <a href="/personvern.html">Personvern</a>
          <a href="/vilkar.html">Vilkår og kilder</a>
          <a href="/tilgjengelighet.html">Tilgjengelighet</a>
        </nav>
      </footer>
    </div>
  )
}
function Archive({ articles }) {
  const [filters, setFilters] = useState({
    query: '',
    topic: '',
    geography: '',
    type: '',
  })
  const [visibleCount, setVisibleCount] = useState(12)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    setFilters(Object.fromEntries(Object.keys(filters).map((k) => [k, params.get(k) ?? ''])))
  }, [])
  const update = (key, value) => {
    const next = { ...filters, [key]: value }
    setFilters(next)
    setVisibleCount(12)
    const params = new URLSearchParams(Object.entries(next).filter(([, v]) => v))
    window.history.replaceState(null, '', `/analyser/${params.size ? '?' + params : ''}`)
  }
  const results = filterAnalyses(articles, filters)
  return (
    <>
      <header className="an-intro">
        <div className="ft-kicker">Tall på bordet</div>
        <h1>Bak tallene.</h1>
        <p className="an-lead">
          Hva vokser, hva endrer seg, og hva betyr det? Grundige analyser av offentlig pengebruk,
          med regnestykkene på bordet.
        </p>
      </header>
      <a className="an-sven-link" href="/analyser/mot-sven/">
        <img src="/bilder/sven-ai-analytiker.webp" width="56" height="56" alt="" decoding="async" />
        <span>
          <strong>Møt Sven</strong>
          <span>Bli kjent med vår AI-analytiker og oppdraget hans.</span>
        </span>
        <span aria-hidden="true">→</span>
      </a>
      <section aria-label="Finn analyser" className="an-filters">
        <label className="an-search">
          Søk i analysene
          <input
            type="search"
            aria-label="Søk i analysene"
            placeholder="Tema, sted eller nøkkelord"
            value={filters.query}
            onChange={(e) => update('query', e.target.value)}
          />
        </label>
        {[
          ['topic', 'Tema'],
          ['geography', 'Geografi'],
          ['type', 'Analysetype'],
        ].map(([key, label]) => (
          <label key={key}>
            {label}
            <select
              aria-label={label}
              value={filters[key]}
              onChange={(e) => update(key, e.target.value)}
            >
              <option value="">Alle</option>
              {[...new Set(articles.map((a) => a[key]))]
                .sort((a, b) => a.localeCompare(b, 'nb'))
                .map((v) => (
                  <option key={v}>{v}</option>
                ))}
            </select>
          </label>
        ))}
      </section>
      <div className="an-count" role="status" aria-live="polite">
        {results.length} {results.length === 1 ? 'analyse' : 'analyser'}
        {Object.values(filters).some(Boolean) && (
          <button
            type="button"
            onClick={() => {
              setFilters({ query: '', topic: '', geography: '', type: '' })
              window.history.replaceState(null, '', '/analyser/')
            }}
          >
            Nullstill filtre
          </button>
        )}
      </div>
      {results.length ? (
        <>
          <div className="an-list">
            {results.slice(0, visibleCount).map((a) => (
              <article className="an-card" key={a.slug}>
                <div className="an-card-meta">
                  <span>
                    {a.topic} · {a.geography}
                  </span>
                  <time dateTime={a.publishedAt}>{displayDate(a.publishedAt)}</time>
                </div>
                <h2>
                  <a href={analysisPath(a.slug)}>
                    {a.copy.title}
                    <span aria-hidden="true"> ↗</span>
                  </a>
                </h2>
                <p>{factText(a.copy.description, a.report)}</p>
                <div className="an-tags">
                  <span>{a.type}</span>
                  <span>
                    Dataperiode {a.report.start}–{a.report.end}
                  </span>
                </div>
              </article>
            ))}
          </div>
          {visibleCount < results.length && (
            <button className="an-more" onClick={() => setVisibleCount((n) => n + 12)}>
              Vis flere analyser ({results.length - visibleCount} gjenstår)
            </button>
          )}
        </>
      ) : (
        <div className="an-empty">
          <h2>
            {articles.length ? 'Ingen analyser passer søket' : 'Den første analysen er på vei'}
          </h2>
          <p>
            {articles.length
              ? 'Prøv et annet søkeord eller nullstill filtrene.'
              : 'Her samler vi analyser av statens og kommunenes pengebruk. Hver analyse gjennomgås av et menneske før den publiseres.'}
          </p>
          <a href="/#utforsk">Utforsk datagrunnlaget i mellomtiden →</a>
        </div>
      )}
    </>
  )
}
function Article({ article, preview, review, successor }) {
  const { report: r, copy: c } = article
  const t = (text) => factText(text, r)
  const budget = r.kind === 'budget-comparison'
  const bridgeLed = c.layout === 'bridge-led'
  const MethodContainer = bridgeLed ? 'details' : React.Fragment
  const oil = r.kind === 'oil-funds'
  const graphs = graphPlan(c, r)
  const components = {
    growth: GrowthComparison,
    'real-expenditure': RealExpenditureChart,
    'annual-change': AnnualChangeChart,
    'budget-totals': BudgetTotals,
    'budget-changes': BudgetChanges,
    'budget-bridge': BudgetBridge,
  }
  const changes = new Map(annualChanges(budget || oil ? [] : r.rows).map((row) => [row.year, row.change]))
  const words = c.sections
    .flatMap((s) => s.paragraphs)
    .join(' ')
    .split(/\s+/).length
  return (
    <article className="an-article">
      <a className="an-back" href="/analyser/">
        ← Alle analyser
      </a>
      {preview && (
        <aside className="an-preview" role="note">
          <strong>Utkast til gjennomgang</strong>
          <p>Denne analysen og LinkedIn-teksten er ikke godkjent for publisering.</p>
          {review && (
            <p>
              <a href={review.url}>Gi tilbakemelding eller godkjenn i GitHub →</a>
              <br />
              Versjon {review.head.slice(0, 8)}
            </p>
          )}
        </aside>
      )}
      {successor && (
        <aside className="an-preview" role="note">
          <strong>En nyere analyse er tilgjengelig</strong>
          <p>
            Denne tidligere versjonen er bevart.{' '}
            <a href={analysisPath(successor.slug)}>Les den oppdaterte analysen →</a>
          </p>
        </aside>
      )}
      <header className="an-article-header">
        <div className="ft-kicker">
          {article.topic} · {article.geography}
        </div>
        <h1>{t(c.title)}</h1>
        <p className="an-lead">{t(c.lead)}</p>
        <div className="an-author">
          <img
            className="an-author-portrait"
            src="/bilder/sven-ai-analytiker.webp"
            width="56"
            height="56"
            alt="AI-generert portrett av Sven"
            decoding="async"
          />
          <p className="an-author-credit">
            Skrevet av{' '}
            <a href="/analyser/mot-sven/">
              <strong>Sven</strong>
            </a>
            , vår AI-analytiker
          </p>
        </div>
        <div className="an-byline">
          <span>Fellestall · {preview ? 'Utkast' : 'Analyse'}</span>
          <time dateTime={preview ? article.createdAt : article.publishedAt}>
            {preview ? 'Laget' : 'Publisert'}{' '}
            {displayDate(preview ? article.createdAt : article.publishedAt)}
          </time>
          {preview && article.generatedAt && article.generatedAt !== article.createdAt && (
            <time dateTime={article.generatedAt}>Revidert {displayDate(article.generatedAt)}</time>
          )}
          <span>{Math.ceil(words / 180)} min lesetid</span>
        </div>
        <p className="an-data-date">
          {budget ? `${r.beforeLabel} → ${r.afterLabel}` : oil ? `Nøkkeltall ${r.start}–${r.end}, inkludert anslag og forslag` : `Regnskap ${r.start}–${r.end}`} ·
          Datagrunnlag oppdatert {displayDate(r.dataUpdated)}
        </p>
        {bridgeLed && <p className="an-data-date">Revidert følger Fellestalls løpende serie: saldert budsjett pluss registrerte endringsvedtak hos DFØ.</p>}
      </header>
      {!bridgeLed && <section className="an-conclusion" aria-labelledby="konklusjon">
        <div className="ft-stikkord">Hovedfunn</div>
        <h2 id="konklusjon">Vår vurdering</h2>
        <p>{t(c.conclusion)}</p>
      </section>}
      {!bridgeLed && <div className="an-stat-grid">
        {(oil
          ? ['annualNominalChange', 'annualRealGrowth', 'fundPercent']
          : budget
          ? ['beforeTotal', 'afterTotal', 'absoluteChange']
          : ['nominalGrowth', 'priceGrowth', 'realPerCapitaGrowth']
        ).map((key) => (
          <div key={key}>
            <span>{r.facts[key].label}</span>
            <strong className="num">{r.facts[key].text}</strong>
            <small>
              {oil ? key === 'fundPercent' ? r.end : `${r.end - 1}–${r.end}` : `${r.start}–${r.end}`}
            </small>
          </div>
        ))}
      </div>}
      {!bridgeLed && <nav className="an-contents" aria-label="I denne analysen">
        <span className="ft-stikkord">I analysen</span>
        {c.sections.map((s, i) => (
          <a key={i} href={`#avsnitt-${i + 1}`}>
            {t(s.heading)}
          </a>
        ))}
        <a href="#metode">Metode og kilder</a>
      </nav>}
      {c.sections.map((s, i) => (
        <React.Fragment key={i}>
          <section className="an-prose" id={`avsnitt-${i + 1}`}>
            <h2>{t(s.heading)}</h2>
            {s.paragraphs.map((p, j) => (
              <p key={j}>{t(p)}</p>
            ))}
            {!bridgeLed && s.factIds.length > 0 && (
              <p className="an-reference">
                <a
                  href={
                    r.ukraineEvidence && s.factIds.some((id) => id.startsWith('ukraine'))
                      ? r.fullBudget ? '#fulltbudsjett' : '#ukrainagrunnlag'
                      : r.eventEvidence?.items.some((item) =>
                      s.factIds.some((id) => id.startsWith(item.id)),
                    )
                      ? '#hendelsesgrunnlag'
                      : '#faktagrunnlag'
                  }
                >
                  Se tallgrunnlaget for dette avsnittet ↓
                </a>
              </p>
            )}
          </section>
          {graphs
            .filter((g) => g.afterSection === i)
            .map((g, j) => {
              const Chart = components[g.kind]
              return g.kind === 'series' ? (
                <SeriesChart key={j} graph={g} report={r} />
              ) : (
                <Chart key={j} report={r} graph={g} />
              )
            })}
        </React.Fragment>
      ))}
      {r.eventEvidence && <EventEvidence report={r} />}
      {budget && <PoliticalEvidence report={r} />}
      {budget && !bridgeLed && <PartyPriorities report={r} />}
      <section id="metode" className="an-method">
        <MethodContainer>
        {bridgeLed ? <summary>Metode og kilder</summary> : <><div className="ft-kicker">Åpent regnestykke</div><h2>Metode og kilder</h2></>}
        {r.methodology.map((p, i) => (
          <p key={i}>{p}</p>
        ))}
        <h3>Hva analysen ikke kan fortelle</h3>
        <ul>
          {r.limitations.map((p, i) => (
            <li key={i}>{p}</li>
          ))}
        </ul>
        <h3>Kilder</h3>
        <ul className="an-sources">
          {r.sources.map((s) => (
            <li key={s.name}>
              <a href={s.url}>{s.name} ↗</a>
              <p>{s.description}</p>
            </li>
          ))}
        </ul>
        <p>
          Analysen er skrevet med AI-støtte.
          {!preview &&
            ' Artikkelen og delingsteksten er gjennomgått av et menneske før publisering.'}{' '}
          Beregningene er gjort i kode.
        </p>
        </MethodContainer>
      </section>
      {oil ? (
        <OilEvidence report={r} />
      ) : budget ? (
        bridgeLed ? <details className="an-supplement"><summary>Kontrolltabell: de største postendringene</summary><BudgetEvidence report={r} /></details> : <BudgetEvidence report={r} />
      ) : (
        <section id="faktagrunnlag" className="an-evidence">
          <h2>Tallene bak analysen</h2>
          <p>
            Beløp i kroner per innbygger. Faste priser er oppgitt i {r.end}
            -kroner.
          </p>
          <div
            className="an-table-scroll"
            tabIndex={0}
            role="region"
            aria-label="Årlige verdier i analysen"
          >
            <table>
              <caption>
                Regnskap {r.start}–{r.end}, uten finansposter og SPU-overføringer
              </caption>
              <thead>
                <tr>
                  <th scope="col">År</th>
                  <th scope="col">Løpende kroner</th>
                  <th scope="col">Faste kroner</th>
                  <th scope="col">KPI</th>
                  <th scope="col">Årlig KPI-justert endring</th>
                </tr>
              </thead>
              <tbody>
                {r.rows.map((row) => (
                  <tr key={row.year}>
                    <th scope="row">{row.year}</th>
                    <td className="num">{number(row.perCapita)}</td>
                    <td className="num">{number(row.realPerCapita)}</td>
                    <td className="num">{number(row.cpi, 1)}</td>
                    <td className="num">
                      {changes.has(row.year) ? `${number(changes.get(row.year), 1)} %` : '–'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!preview && (
            <a href="./datagrunnlag.json" download>
              Last ned analysens frosne datagrunnlag (JSON) ↓
            </a>
          )}
        </section>
      )}
      {(budget || oil) && !preview && (
        <a href="./datagrunnlag.json" download>
          Last ned analysens frosne datagrunnlag (JSON) ↓
        </a>
      )}
      {oil && r.fullBudget && <FullOilBudget evidence={r.fullBudget} />}
      {oil && r.ukraineEvidence && (r.fullBudget
        ? <details><summary>Historisk postkontroll og tidligere programomtale</summary><UkraineEvidence evidence={r.ukraineEvidence} /></details>
        : <UkraineEvidence evidence={r.ukraineEvidence} />)}
      {preview && (
        <section className="an-method">
          <h2>LinkedIn-utkast</h2>
          <p className="an-linkedin">{t(c.linkedin)}</p>
          <p>Lenke legges til når den godkjente analysesiden er tilgjengelig.</p>
        </section>
      )}
      <div className="an-return">
        <a href="/#prisvekst">Undersøk utviklingen selv i Fellestall →</a>
      </div>
    </article>
  )
}

function FullOilBudget({ evidence }) {
  return <section className="an-evidence" id="fulltbudsjett">
    <h2>Fondsoverføring og samlet Ukraina-støtte</h2>
    <p>Nasjonalbudsjettets samlede tabeller. Milliarder kroner; siste år er forslag og året før er oppdatert anslag.</p>
    <div className="an-table-scroll" tabIndex={0} role="region" aria-label="Fondsoverføring og inntekter">
      <table style={{ whiteSpace: 'normal' }}>
        <caption>Fondsoverføring og inntekter utenom petroleum. Overføringen for første år avviker fra underskuddet fordi regnskapet viste et overskudd.</caption>
        <thead><tr><th scope="col">År</th><th scope="col">Fondsoverføring</th><th scope="col">Inntekter utenom petroleum</th></tr></thead>
        <tbody>{evidence.rows.map(row => <tr key={row.year}><th scope="row">{row.year}</th><td className="num">{number(row.transfer, 1)}</td><td className="num">{number(row.nonOilIncome, 1)}</td></tr>)}</tbody>
      </table>
    </div>
    <div className="an-table-scroll" tabIndex={0} role="region" aria-label="Samlet Ukraina-støtte og bevilgninger">
      <table style={{ whiteSpace: 'normal' }}>
        <caption>Samlet støtte fordelt på bevilgninger og materielldonasjoner, tabell 3.7. Bevilgninger er ikke bokførte utbetalinger.</caption>
        <thead><tr><th scope="col">År</th><th scope="col">Samlet støtte</th><th scope="col">Bevilgning</th><th scope="col">Donert materiell</th></tr></thead>
        <tbody>{evidence.ukraineRows.map(row => <tr key={row.year}><th scope="row">{row.year}</th>{[row.total,row.appropriation,row.donated].map((n,i)=><td key={i} className="num">{number(n,1)}</td>)}</tr>)}</tbody>
      </table>
    </div>
    <p>Det foreslås i tillegg {number(evidence.reacquisition,1)} mrd. kroner til gjenanskaffelser av donert materiell. Disse inngår ikke i årets Nansen-bevilgning. Fordelingen mellom militær og sivil støtte videreføres fra året før.</p>
    <p>Den nye tabellen oppgir samlet støtte til 85,0 mrd. i 2025. Den eldre kontrollen nedenfor oppgir en programramme på 84,9 mrd. og et begrenset postutvalg. Det nye samlede budsjettgrunnlaget brukes i analysen.</p>
  </section>
}

function OilEvidence({ report: r }) {
  return (
    <section id="faktagrunnlag" className="an-evidence">
      <h2>Tallene bak analysen</h2>
      <p>
        Strukturelt oljekorrigert budsjettunderskudd, i milliarder kroner.
        Dette er et justert mål på oljepengebruk. Selve fondsoverføringen er en annen størrelse.
        Serien inkluderer anslag og budsjettforslag; faste priser er oppgitt i {r.end}-kroner.
      </p>
      <div className="an-table-scroll" tabIndex={0} role="region" aria-label="Oljepengebruk og fondsandel per år">
        <table>
          <caption>Finansdepartementets nøkkeltall {r.start}–{r.end}</caption>
          <thead>
            <tr>
              <th scope="col">År</th>
              <th scope="col">Løpende priser, mrd. kr</th>
              <th scope="col">Faste priser, mrd. kr</th>
              <th scope="col">Andel av fondet ved årets inngang</th>
            </tr>
          </thead>
          <tbody>
            {r.rows.map((row) => (
              <tr key={row.year}>
                <th scope="row">{row.year}</th>
                <td className="num">{number(row.nominal, 1)}</td>
                <td className="num">{number(row.real, 1)}</td>
                <td className="num">{number(row.fundPercent, 1)} %</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function UkraineEvidence({ evidence }) {
  const stages = { regnskap: 'Regnskap', revidert: 'Løpende revidert budsjett' }
  const postLabel = (id) => id.split('-').slice(-2).join('/')
  return (
    <section className="an-evidence" id="ukrainagrunnlag">
      <h2>Ukraina: støtterammer og konkrete poster</h2>
      <p>Støtterammer og bokførte eller budsjetterte utgifter er ulike størrelser.</p>
      <div className="an-table-scroll" tabIndex={0} role="region" aria-label="Nansen-programmets støtterammer">
        <table style={{ whiteSpace: 'normal' }}>
          <caption>Nansen-programmet, milliarder kroner. Status for hvert år står under tabellen.</caption>
          <thead>
            <tr>
              <th scope="col">År</th>
              <th scope="col">Samlet ramme</th>
              <th scope="col">Militær støtte</th>
              <th scope="col">Sivil støtte</th>
            </tr>
          </thead>
          <tbody>
            {evidence.programmeRows.map((row) => (
              <tr key={row.year}>
                <th scope="row">{row.year}</th>
                {[row.total, row.military, row.civil].map((value, i) => (
                  <td key={i} className="num">{value === null ? 'Ikke avklart' : number(value, 1)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {evidence.programmeRows.map((row) => (
        <p key={row.year}><strong>{row.year}:</strong> {row.status}.</p>
      ))}
      <div className="an-table-scroll" tabIndex={0} role="region" aria-label="Utvalgte Ukraina-relaterte regnskaps- og budsjettposter">
        <table style={{ whiteSpace: 'normal' }}>
          <caption>Utvalgte poster, millioner kroner. Dette er ikke et fullstendig Ukraina-regnskap.</caption>
          <thead>
            <tr>
              <th scope="col">År og serie</th>
              <th scope="col">Departement og post</th>
              <th scope="col">Beløp</th>
            </tr>
          </thead>
          <tbody>
            {evidence.postRows.map((row) => (
              <tr key={`${row.year}-${row.stage}-${row.id}`}>
                <th scope="row">{row.year} · {stages[row.stage] ?? row.stage}</th>
                <td>{row.department}: {row.name} ({postLabel(row.id)})</td>
                <td className="num" style={{ whiteSpace: 'nowrap' }}>{number(row.amountMillion, 1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {evidence.rnbReconciliation?.length > 0 && (
        <details className="an-table-scroll">
          <summary>Se avstemmingen mot RNB-forslaget for 2026</summary>
          <table>
            <caption>Saldert budsjett pluss foreslått RNB-endring, millioner kroner. Dette dokumenterer forslaget, ikke Stortingets vedtak.</caption>
            <thead>
              <tr>
                <th scope="col">Kapittel/post</th>
                <th scope="col">Saldert</th>
                <th scope="col">RNB-endring</th>
                <th scope="col">RNB-forslag</th>
              </tr>
            </thead>
            <tbody>
              {evidence.rnbReconciliation.map((row) => (
                <tr key={row.id}>
                  <th scope="row">{postLabel(row.id)}</th>
                  <td className="num">{number(row.baselineMillion, 1)}</td>
                  <td className="num">{number(row.changeMillion, 1)}</td>
                  <td className="num">{number(row.proposedMillion, 1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      )}
      {evidence.notes.map((note, i) => <p key={i}>{note}</p>)}
    </section>
  )
}

function EventEvidence({ report }) {
  const years =
    report.eventEvidence.version === 2
      ? report.rows.map((r) => r.year)
      : [
          ...new Set([
            report.start <= 2019 && report.end >= 2019 ? 2019 : report.start,
            2020,
            2021,
            report.end,
          ]),
        ]
          .filter((year) => year >= report.start && year <= report.end)
          .sort((a, b) => a - b)
  return (
    <section className="an-evidence an-event-evidence" id="hendelsesgrunnlag">
      <h2>Hva skjedde med de konkrete postene?</h2>
      <p>Utvalgte eksempler fra det samme regnskapet. Beløp i løpende millioner kroner.</p>
      <div
        className="an-table-scroll"
        tabIndex={0}
        role="region"
        aria-label="Utvalgte regnskapsposter gjennom perioden"
      >
        <table>
          <caption>
            {report.eventEvidence.version === 2
              ? 'Utvalgene kan overlappe og skal ikke summeres. Alle observerte regnskapsår i perioden vises.'
              : 'Dette er et utvalg poster, ikke et fullstendig regnskap for pandemien eller Ukraina-støtten.'}
          </caption>
          <colgroup>
            <col style={{ width: '40%' }} />
            {years.map((year) => (
              <col key={year} />
            ))}
          </colgroup>
          <thead>
            <tr>
              <th scope="col">Regnskapspost</th>
              {years.map((year) => (
                <th key={year} scope="col">
                  {year}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {report.eventEvidence.items.map((item) => (
              <tr key={item.id}>
                <th scope="row">{item.title}</th>
                {years.map((year) => {
                  const row = item.rows.find((row) => row.year === year)
                  return (
                    <td className="num" key={year}>
                      {row.reported ? number(row.expenditure, 1) : '—'}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p>
        «—» betyr ingen regnskapsføring på denne posten i uttrekket. Føring på andre poster og
        endrede ordninger kan påvirke sammenligningen. Underliggende post-ID-er og hele tidsseriene
        følger det frosne datagrunnlaget.
      </p>
    </section>
  )
}
export default function AnalyseApp({
  articles = [],
  article = null,
  preview = false,
  review = null,
  notFound = false,
  meetSven = false,
  successor = null,
}) {
  useEffect(() => {
    document.body.classList.add('ft-body')
    return () => document.body.classList.remove('ft-body')
  }, [])
  return (
    <Frame>
      {notFound ? (
        <div className="an-empty">
          <h1>Analysen finnes ikke</h1>
          <p>Den kan ha blitt flyttet, eller adressen er feil.</p>
          <a href="/analyser/">Se alle analyser →</a>
        </div>
      ) : meetSven ? (
        <MeetSven />
      ) : article ? (
        <Article article={article} preview={preview} review={review} successor={successor} />
      ) : (
        <Archive articles={articles} />
      )}
    </Frame>
  )
}
