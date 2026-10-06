import React from 'react'

export default function MeetSven() {
  return (
    <article className="an-article an-sven">
      <a className="an-back" href="/analyser/">← Alle analyser</a>
      <header className="an-sven-header">
        <div>
          <div className="ft-kicker">Vår AI-analytiker</div>
          <h1>Møt Sven.</h1>
          <p className="an-lead">
            Han har sans for orden, svakhet for gode spørsmål og begrenset tålmodighet med
            tall som mangler sammenheng.
          </p>
        </div>
        <img
          className="an-sven-portrait"
          src="/bilder/sven-ai-analytiker.webp"
          width="240"
          height="240"
          alt="AI-generert portrett av Sven, Fellestalls AI-analytiker"
          decoding="async"
        />
      </header>
      <section className="an-prose">
        <h2>Et kort navn. Et ganske stort oppdrag.</h2>
        <p>
          Sven er Fellestalls AI-analytiker. Navnet er et akronym for <strong>Skattepengenes
          Vaktbikkje, Etterforsker og Nøkkeltallsanalytiker</strong>. Det er mye ansvar i fire
          bokstaver, men han har aldri vært særlig opptatt av korte stillingstitler.
        </p>
        <p>
          Han undersøker offentlig pengebruk og gjør tallene lettere å forstå. Hvor går pengene?
          Hva har endret seg? Og hvor stor er egentlig en milliard når den fordeles på oss alle?
          Sven leter etter sammenhengene bak beløpene og forklarer hvorfor de er verdt å merke seg.
        </p>
      </section>
      <section className="an-prose">
        <h2>Nesen i tallene. Blikket på fellesskapet.</h2>
        <p>
          Sven følger statens og kommunenes inntekter, utgifter og prioriteringer. Han er særlig
          opptatt av utvikling over tid, forskjeller mellom steder og avstanden mellom det som
          budsjetteres og det som faktisk brukes.
        </p>
        <p>
          Et større beløp får ham ikke automatisk til å heve øyenbrynet. Prisvekst, folketall og
          endrede oppgaver kan gjøre en stor forskjell. Han vil vite hva tallene betyr før han
          mener noe om dem. Prosenttegn er tross alt ingen forklaring i seg selv.
        </p>
        <p>
          Som vaktbikkje er han våken, men han bjeffer ikke på hver budsjettpost. Et avvik er et
          spørsmål som fortjener et svar, ikke en dom. Han er like interessert i det som fungerer
          godt, som i det som bør undersøkes nærmere.
        </p>
      </section>
      <blockquote className="an-sven-quote">
        <p>«Jeg har ingen favorittpolitiker. Men jeg setter pris på en presis fotnote.»</p>
        <footer>— Sven</footer>
      </blockquote>
      <section className="an-prose">
        <h2>Flere gode spørsmål. Bedre offentlig samtale.</h2>
        <p>
          Sven ønsker å gjøre offentlige finanser tilgjengelige for flere enn dem som leser
          budsjettdokumenter til frokost. Målet er at du skal kunne forstå prioriteringene,
          vurdere påstandene og stille bedre spørsmål om pengene vi deler.
        </p>
        <p>
          Han tar ikke parti, og han bestemmer ikke hva pengene bør brukes på. Han vil gi deg
          et bedre grunnlag for å gjøre deg opp din egen mening. Når tallene ikke gir et klart
          svar, skal usikkerheten også få plass.
        </p>
      </section>
      <section className="an-prose">
        <h2>Kunstig intelligens. Et tydelig ansvar.</h2>
        <p>
          Sven er en AI, og portrettet hans er AI-generert. Han kan ta feil. Analysene skal
          derfor leses med et kritisk blikk, også når han høres overbevisende ut. Datagrunnlaget
          til Sven kommer fra Fellestall som igjen henter informasjon fra offentlige kilder som
          DFØ og SSB. Leseren må ta forbehold om at det kan oppstå mangler eller feil i dataen,
          enten hos dataleverandørene til Fellestall eller i Fellestall sine egne beregninger.
        </p>
      </section>
      <div className="an-return">
        <a href="/analyser/">Les Svens analyser →</a>
      </div>
    </article>
  )
}
