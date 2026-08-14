import React from 'react'

const SEKSJONER = [
  {
    id: 'prisvekst',
    kortnavn: 'Vokser staten?',
    tittel: 'Vokser staten raskere enn prisene?',
    tekst: 'Sammenlign statens utgifter per innbygger med konsumprisindeksen, og se utviklingen fra 2014 og fremover.',
  },
  {
    id: 'kartet',
    kortnavn: 'Kartet',
    tittel: 'Hele budsjettet på ett kart',
    tekst: 'Se hvordan statsbudsjettet fordeler seg mellom departementer, kapitler og poster, med areal etter størrelsen på beløpet.',
  },
  {
    id: 'flyten',
    kortnavn: 'Flyten',
    tittel: 'Fra inntekt til utgift',
    tekst: 'Følg skatter, avgifter, andre inntekter og overføringen fra Oljefondet videre til områdene staten bruker penger på.',
  },
  {
    id: 'utgifter',
    kortnavn: 'Hvor pengene går',
    tittel: 'Hvor pengene går',
    tekst: 'Utforsk statens utgifter rangert i kroner per innbygger, fra pensjon, helse og kommuner til forsvar, utdanning og samferdsel.',
  },
  {
    id: 'endringer',
    kortnavn: 'Endringer',
    tittel: 'Hva økte, hva ble kuttet',
    tekst: 'Sammenlign regnskap og budsjett mellom år, og bryt de største økningene og kuttene ned til den enkelte budsjettposten.',
  },
  {
    id: 'oljefondet',
    kortnavn: 'Oljefondet',
    tittel: 'Oljefondet: hva som spares, hva som brukes',
    tekst: 'Se oljeinntektene som går inn i fondet, overføringen tilbake til statsbudsjettet og uttaket målt mot rettesnoren på 3 prosent.',
    mork: true,
  },
  {
    id: 'din-andel',
    kortnavn: 'Lønnen din',
    tittel: 'Hva staten får av lønnen din',
    tekst: 'Beregn skatt fra lønn med Stortingets satser, og se hvordan statens del fordeler seg etter de faktiske utgiftene.',
  },
  {
    id: 'utforsk',
    kortnavn: 'Utforsk',
    tittel: 'Utforsk hver krone',
    tekst: 'Søk i statsregnskapet og statsbudsjettet fra departement til kapittel, post og artskonto, med historikk og sammenligning over tid.',
  },
]

function Merke() {
  return (
    <a href="./" className="ft-merke-lenke" aria-label="Fellestall.no – forsiden">
      <div className="ft-logo">Fellestall<span>.no</span></div>
      <div className="ft-slagord">En oversikt over norske statsfinanser</div>
    </a>
  )
}

export default function SeoFallback({ forsteAar = 2014, sisteBudsjettAar = 2026, oppdatert = '' }) {
  const oppdatertDato = oppdatert
    ? new Date(oppdatert).toLocaleDateString('nb-NO', { day: 'numeric', month: 'long', year: 'numeric' })
    : null

  return (
    <div className="ft">
      <a className="ft-hopp" href="#hovedinnhold">Hopp til innholdet</a>
      <div className="ft-layout">
        <aside className="ft-sidemeny" aria-label="Innholdsoversikt">
          <Merke />
          <nav className="ft-nav" aria-label="Hovedinnhold">
            {SEKSJONER.map((s, i) => (
              <a key={s.id} href={`#${s.id}`} className="ft-navlenke">
                <span className="ft-navnr num">{String(i + 1).padStart(2, '0')}</span>
                <span>{s.kortnavn}</span>
              </a>
            ))}
          </nav>
          <div className="ft-sidefot"><a href="#om-tallene">Om tallene</a></div>
        </aside>

        <main className="ft-hovedspalte" id="hovedinnhold">
          <div className="ft-toppbar">
            <div className="ft-toppbar-inner">
              <Merke />
              <nav className="ft-toppnav" aria-label="Hovedinnhold">
                {SEKSJONER.map((s) => <a key={s.id} href={`#${s.id}`}>{s.kortnavn}</a>)}
                <a href="#om-tallene">Om tallene</a>
              </nav>
            </div>
          </div>

          <header className="ft-hero">
            <div className="ft-kicker">
              Statsbudsjettet og statsregnskapet · {forsteAar}–{sisteBudsjettAar}
            </div>
            <h1>Hvor blir det av skattepengene?</h1>
            <div className="ft-hero-grid">
              <p className="ft-ingress">
                Hvert år fører staten regnskap over hver eneste krone, fordelt på departementer,
                kapitler og tusenvis av poster. Fellestall.no normaliserer de offentlige tallene og
                gjør dem forståelige som kroner per innbygger, andeler og utvikling over tid. Du kan
                utforske hele statsbudsjettet og statsregnskapet ned til den enkelte posten.
              </p>
              <div className="ft-femtall" aria-label="Dette kan du utforske">
                <div className="ft-stikkord">Dette kan du utforske</div>
                {['Statsbudsjett og statsregnskap', 'Kroner per innbygger', 'Utvikling fra år til år', 'Oljefondet og handlingsregelen', 'Alle departementer og poster'].map((tekst) => (
                  <div className="ft-femtall-rad" key={tekst}><span>{tekst}</span></div>
                ))}
              </div>
            </div>
          </header>

          {SEKSJONER.map((s) => (
            <section key={s.id} id={s.id} className={`ft-seksjon${s.mork ? ' ft-seksjon--mork' : ''}`}>
              <div className={s.mork ? 'ft-seksjon-innhold' : undefined}>
                <div className="ft-seksjonstekst ft-seksjonstopp">
                  <div>
                    <h2>{s.tittel}</h2>
                    <p>{s.tekst}</p>
                  </div>
                </div>
              </div>
            </section>
          ))}

          <section id="om-tallene" className="ft-seksjon">
            <div className="ft-seksjonstekst ft-seksjonstopp">
              <div>
                <h2>Om tallene</h2>
                <p>
                  Fellestall.no bygger på DFØ Statsregnskapet, Statistisk sentralbyrå og NBIM.
                  Tallene er samlet i én modell for å gjøre budsjett, regnskap, prisvekst, folketall
                  og nasjonalregnskap sammenlignbare. De interaktive grafene krever JavaScript.
                </p>
              </div>
            </div>
          </section>
        </main>
      </div>

      <footer className="ft-fot">
        <div className="ft-fot-grid">
          <div>
            <div className="ft-logo ft-logo--lys">Fellestall<span>.no</span></div>
            <div className="ft-fot-slagord">En oversikt over norske statsfinanser</div>
            <p className="ft-fot-tekst">Statsbudsjettet og statsregnskapet, normalisert og forklart.</p>
            {oppdatertDato && <div className="ft-fot-dato">Sist oppdatert {oppdatertDato}</div>}
          </div>
          <div>
            <div className="ft-stikkord">Kilder</div>
            <div className="ft-fot-lenker">
              <a href="https://statsregnskapet.dfo.no" rel="noreferrer">DFØ Statsregnskapet</a>
              <a href="https://www.ssb.no" rel="noreferrer">SSB</a>
              <a href="https://www.nbim.no" rel="noreferrer">NBIM</a>
            </div>
          </div>
          <div>
            <div className="ft-stikkord">Om siden</div>
            <div className="ft-fot-lenker">
              <a href="personvern.html">Personvern</a>
              <a href="vilkar.html">Vilkår og kilder</a>
              <a href="tilgjengelighet.html">Tilgjengelighet</a>
            </div>
          </div>
        </div>
        <div className="ft-fot-linje">
          <span>Uavhengig, privat prosjekt – ikke tilknyttet noen offentlig etat.</span>
          <span>Ingen informasjonskapsler</span>
        </div>
      </footer>
    </div>
  )
}

