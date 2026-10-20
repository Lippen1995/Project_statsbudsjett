# Fullstendig Fellestall-admin

Brukeren godkjente 20. oktober 2026 hele funksjonslisten. Denne matrisen følger
arbeidet gjennom implementasjon, tester og produksjonskontroll. Et menypunkt eller
en knapp alene regnes ikke som en ferdig funksjon. Ukjente verdier skal vises som
ukjente, og tilganger eller e-postlevering skal ikke simuleres i produksjon.

| Område | Funksjoner som skal leveres | Status |
| --- | --- | --- |
| Oversikt | Samlet drift, oppgaver, neste analyse, gjennomganger, dataalder, siste jobb og snarveier | Implementert; til produksjonskontroll |
| Drift | Faktisk ekstern kontroll, pauset overvåking, tjenester, manglende jobber, hendelser/notater, vedlikehold, domene/SSL | Implementert; til produksjonskontroll |
| Forbruk | Checkly-kvote, prognose, 80/90 %-varsler, forbruk per kontroll, stanset overvåking, abonnement/prøveperiode | Implementert; til produksjonskontroll |
| Ytelse | Trender, enheter, sider, måleantall, P75, utrullingssammenligning, JS/API-feil og vedvarende forverring | Implementert; til produksjonskontroll |
| Trafikk | Analyse-/sidebruk, kilder, periodesammenligning, funksjonsbruk, 404/lenker, robotfilter og CSV uten besøks-ID | Implementert; til produksjonskontroll |
| Datakvalitet | Kilder, oppdateringer, dekning, innhentingsjobber, mangler/duplikater/avvik, summer, enheter, versjonsdiff, tilbakeholding og tilbakeføring | Implementert; til produksjonskontroll |
| Svens arbeid | Aktivitet, siste/neste kjøring, arbeidssteg, stoppårsak, kilder, instruksversjon, leveringer og revisjonsbestilling | Implementert; til produksjonskontroll |
| Læring | Strukturert tilbakemelding, enkeltrettelse/regelforslag, eksplisitt regelgodkjenning, opphav, versjonsdiff, deaktivering/gjenoppretting og kvalitet | Implementert; til produksjonskontroll |
| Pipeline | Kalender, dra/slipp, pause, hasteprioritet, duplikatvarsel, begrunnelse, kildelenker, forsinkelser og skrivedato/publiseringsdato | Implementert; til produksjonskontroll |
| Gjennomgang | Innboks, forhåndsvisning, kommentarer/revisjon, tekstdiff, sjekkliste, eksakt godkjenning, publiseringsstatus, retting/tilbaketrekking og aktørlogg | Implementert; til produksjonskontroll |
| Innhold/distribusjon | Metadata, ingress, tema, delingsbilde, sosial forhåndsvisning, lenke-/bildekontroll, LinkedIn-forhåndsvisning, sending/feil/retry og duplikatvern | Implementert; til produksjonskontroll |
| Kontoer | Passordendring, gjenoppretting, tofaktor/reservekoder, økter, invitasjoner, administrator/redaktør/leser og sikkerhetslogg | Implementert; til produksjonskontroll |
| Varsler | Innboks, mottakere/type, alvorlighet, testmail, leveringsresultat, samling, daglig/ukentlig oppsummering og gjenoppretting | Implementert; til produksjonskontroll |
| Historikk/backup | Søk/filter, aktør, før/etter, reversering, krypterte kopier, dataversjoner, faktisk isolert gjenopprettingstest og integrasjonenes tilgang/utløp | Implementert; til produksjonskontroll |
| Rapporter/hjelp | Månedsrapport, CSV/delbar utskrift, begreper, kilder/metode, oppgaveveiledning og kjente feil/forbedringer | Implementert; til produksjonskontroll |

## Føringer

- Bygg videre på Vite/React, Node 24, Better Auth og eksisterende Neon-database.
- Bevar eksisterende eierkonto og passord. Aktivering av tofaktor er frivillig
  og krever at brukeren fullfører oppsettet; ingen produksjonskonto skal låses ute.
- Tilgang sjekkes på serveren for hver handling. Redaktører kan ikke publisere,
  administrere kontoer eller gjenopprette produksjonsdata. Lesere kan ikke skrive.
- Bevar SHA-konfliktvern, eksakt versjonsgodkjenning, menneskelig gjennomgang,
  abonnementsbasert tekstproduksjon og høyst ett uoppfordret kommende Sven-tema.
- Ikke legg private kontodata, mottakerregistre, hemmeligheter eller brukerspesifikk
  konfigurasjon i det offentlige GitHub-arkivet.
- Ingen besøks-ID, rå søketekst, beregningsbeløp eller full henvisningsadresse i
  publikumsstatistikken. Nye fordelinger skal bygges fra faktiske observasjoner.
- Produksjonsendringer skal være additive. Tester bruker isolert PostgreSQL og
  testintegrasjoner; faktiske eksterne konfigurasjoner og sendinger må kontrolleres
  særskilt. Ikke merk en inaktiv eller utilgjengelig integrasjon som aktiv.

## Avhengigheter som krever brukerens konto

- Resend er ikke koblet til. Brukeren er spurt om tilkobling for invitasjoner,
  passordgjenoppretting og oppsummeringer. Checkly-varslingen består.
- GitHub-tokenens nødvendige PR-/Actions-rettigheter må bekreftes før slike
  skriveruter aktiveres. Agentens sesjonstoken skal ikke kopieres til runtime.

