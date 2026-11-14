import React from 'react'
export default function ProductApp({ page, notFound = false }) {
  const sameie = page === 'sameie'
  return <div className="products">
    <a className="products-skip" href="#hovedinnhold">Hopp til innholdet</a>
    <header className="products-header"><a className="products-brand" href="/">Fellestall<span>hjelper deg</span></a><a href="/">Til Fellestall.no</a></header>
    <main id="hovedinnhold">
      {notFound ? <section className="products-section"><h1>Siden finnes ikke.</h1><a href="/hjelper-deg/">Se tjenestene våre</a></section> : <>
        <section className="products-hero"><p className="products-kicker">{sameie ? 'Mitt Sameie · under utvikling' : 'Fellestall hjelper deg'}</p>
          <h1>{sameie ? <>Felles hjem.<br/>Enklere hverdag.</> : <>Digitale verktøy.<br/>Praktisk hjelp.</>}</h1>
          <p className="products-intro">{sameie ? 'For dere som deler et bygg – og ansvaret for å ta vare på det. Vi utvikler en enkel styre- og beboerplattform for norske eierseksjonssameier.' : 'Vi utvikler selvstendige tjenester som gjør det enklere å forstå, planlegge og ta gode beslutninger. Først ut er Mitt Sameie.'}</p>
          <p className="products-notice"><strong>Under utvikling.</strong> Tjenesten er ikke kommersielt lansert. Registrering åpnes etter at BankID og tilgangskontroll er verifisert.</p>
          {sameie ? <div className="products-actions"><a className="products-button" href="https://sameie.fellestall.no/kom-i-gang">Opprett bruker / Kom i gang</a><a className="products-button products-button-secondary" href="https://sameie.fellestall.no/logg-inn">Logg inn</a></div> : <a className="products-button" href="/hjelper-deg/mitt-sameie/">Bli kjent med Mitt Sameie</a>}
          {sameie ? <p className="products-help">Appadressene åpnes når utviklingsmiljø og innlogging er klargjort. Ingen betalingskort ved oppstart.</p> : null}
        </section>
        {sameie ? <>
          <section className="products-section" aria-labelledby="why-title"><h2 id="why-title">Mer oversikt. Mindre administrasjon.</h2><p>Styret består ofte av vanlige boligeiere. Mitt Sameie skal samle oppgavene som følger bygget, veilede dere videre og forberede rutinearbeidet automatisk. Menneskene tar beslutningene.</p><dl><div><dt>Enkelt på mobilen</dt><dd>Meld en skade, finn et dokument eller følg en sak der du er.</dd></div><div><dt>Historikk som varer</dt><dd>Byggets dokumentasjon skal bli med videre når eiere og styremedlemmer skiftes ut.</dd></div><div><dt>Tilgang etter ansvar</dt><dd>Verifisert identitet og styremyndighet skal beskytte sameiets og beboernes opplysninger.</dd></div></dl></section>
          <section className="products-section" aria-labelledby="status-title"><h2 id="status-title">Hva finnes – og hva kommer?</h2><div className="products-status"><h3>Bygget i utviklingsmiljøet</h3><p>Teknisk fundament, databaseisolasjon og automatiserte tester. Oppstartsprosessen utvikles og testes nå. Dette er ikke et tilbud om bruk med ekte kundedata.</p><h3>Planlagt før lansering</h3><p>BankID og passkeys, verifisert sameieopprettelse, dokumentarkiv, møter og avstemninger, økonomisk oversikt, årshjul, vedlikehold, HMS og en funksjonell 3D-grunnmodell.</p><h3>Separate tillegg senere</h3><p>AI Premium og SameieSammen. Grunnproduktet skal fungere uten AI.</p></div></section>
          <section className="products-section" aria-labelledby="start-title"><h2 id="start-title">Slik skal oppstarten fungere</h2><ol><li>Bekreft identiteten din med BankID.</li><li>Finn sameiet med organisasjonsnummer, eller registrer opplysninger manuelt når registerdata mangler.</li><li>Få tilgangen som er dokumentert. Administrative rettigheter krever verifisert styremyndighet.</li></ol><p>Abonnementet betales av sameiet og prises etter antall seksjoner. Planlagt prøveperiode er 30 dager uten betalingskort. Prisene fastsettes før lansering.</p></section>
        </> : <section className="products-section"><p className="products-kicker">Første tjeneste</p><h2>Mitt Sameie</h2><p>En plattform under utvikling for små og mellomstore eierseksjonssameier, særlig dere som har 2–20 seksjoner og administrerer bygget selv.</p><a href="/hjelper-deg/mitt-sameie/">Les om Mitt Sameie →</a></section>}
      </>}
    </main><footer className="products-footer"><span>Fellestall hjelper deg</span><a href="/personvern.html">Personvern</a><a href="/hjelper-deg/">Tjenesteoversikt</a></footer>
  </div>
}
