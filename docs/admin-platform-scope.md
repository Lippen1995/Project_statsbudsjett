# Fullstendig Fellestall-admin

Brukeren godkjente 20. oktober 2026 hele funksjonslisten. Denne matrisen følger
arbeidet gjennom implementasjon, tester og produksjonskontroll. Et menypunkt eller
en knapp alene regnes ikke som en ferdig funksjon. Ukjente verdier skal vises som
ukjente, og tilganger eller e-postlevering skal ikke simuleres i produksjon.

| Område | Funksjoner som skal leveres | Status |
| --- | --- | --- |
| Oversikt | Samlet drift, oppgaver, neste analyse, gjennomganger, dataalder, siste jobb og snarveier | Publisert; server- og nettleserkontroll bestått |
| Drift | Faktisk ekstern kontroll, pauset overvåking, tjenester, manglende jobber, hendelser/notater, vedlikehold, domene/SSL | Publisert; server- og nettleserkontroll bestått |
| Forbruk | Checkly-kvote, prognose, 80/90 %-varsler, forbruk per kontroll, stanset overvåking, abonnement/prøveperiode | Publisert; server- og nettleserkontroll bestått |
| Ytelse | Trender, enheter, sider, måleantall, P75, utrullingssammenligning, JS/API-feil og vedvarende forverring | Publisert; server- og nettleserkontroll bestått |
| Trafikk | Analyse-/sidebruk, kilder, periodesammenligning, funksjonsbruk, 404/lenker, robotfilter og CSV uten besøks-ID | Publisert; server- og nettleserkontroll bestått |
| Datakvalitet | Kilder, oppdateringer, dekning, innhentingsjobber, mangler/duplikater/avvik, summer, enheter, versjonsdiff, tilbakeholding og tilbakeføring | Publisert; server- og nettleserkontroll bestått |
| Svens arbeid | Aktivitet, siste/neste kjøring, arbeidssteg, stoppårsak, kilder, instruksversjon, leveringer og revisjonsbestilling | Publisert; server- og nettleserkontroll bestått |
| Læring | Strukturert tilbakemelding, enkeltrettelse/regelforslag, eksplisitt regelgodkjenning, opphav, versjonsdiff, deaktivering/gjenoppretting og kvalitet | Publisert; server- og nettleserkontroll bestått |
| Pipeline | Kalender, dra/slipp, pause, hasteprioritet, duplikatvarsel, begrunnelse, kildelenker, forsinkelser og skrivedato/publiseringsdato | Publisert; server- og nettleserkontroll bestått |
| Gjennomgang | Innboks, forhåndsvisning, kommentarer/revisjon, tekstdiff, sjekkliste, eksakt godkjenning, publiseringsstatus, retting/tilbaketrekking og aktørlogg | Publisert; GitHub-skrivetilgang må avklares |
| Innhold/distribusjon | Metadata, ingress, tema, delingsbilde, sosial forhåndsvisning, lenke-/bildekontroll, LinkedIn-forhåndsvisning, sending/feil/retry og duplikatvern | Publisert; GitHub-skrivetilgang må avklares |
| Kontoer | Passordendring, gjenoppretting, tofaktor/reservekoder, økter, invitasjoner, administrator/redaktør/leser og sikkerhetslogg | Publisert; e-postoppsett gjenstår |
| Varsler | Innboks, mottakere/type, alvorlighet, testmail, leveringsresultat, samling, daglig/ukentlig oppsummering og gjenoppretting | Publisert; Checkly bekreftet, øvrig e-post avventer |
| Historikk/backup | Søk/filter, aktør, før/etter, reversering, krypterte kopier, dataversjoner, faktisk isolert gjenopprettingstest og integrasjonenes tilgang/utløp | Publisert; server- og nettleserkontroll bestått |
| Rapporter/hjelp | Månedsrapport, CSV/delbar utskrift, begreper, kilder/metode, oppgaveveiledning og kjente feil/forbedringer | Publisert; server- og nettleserkontroll bestått |

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

