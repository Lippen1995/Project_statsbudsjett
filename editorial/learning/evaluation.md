# Sammenlign kvaliteten før vi kaller det læring
Versjon 1 • 18. oktober 2026

Dette er en evaluering å gjennomføre, ikke rapporterte testresultater. Startutvalget er for lite til å dokumentere varig kvalitetsløft.

## Før-/etterrunde med identisk grunnlag
Bruk den samme frosne rapporten fra `editorial/drafts/pilot.json` på en fast commit. Registrer rapporthash, commit, modell, prompt og dato. Ikke hent nye fakta i bare én av variantene.

- A: eksisterende skriveinstruks uten den nye håndboken og referansenotatene.
- B: samme instruks og oppgave, med læringsmaterialet.
- Skriv hver variant i separat kontekst uten den andre teksten, og behold faktisk prompt.
- Vis variantene som X/Y i tilfeldig rekkefølge når mulig. Be brukeren velge og gjerne forklare med én vanlig setning.
- Brukerens vurdering er hovedsignalet for tone. AI-vurdering er bare støtte; menneskelig journalistfaglig gjennomgang er ikke gjennomført.
- Ikke gi B seier bare fordi den er kortere, mer tabloid eller har høyere egenvurdering.

## Tre faste oppgaver
1. Skriv tittel, ingress og de to første avsnittene fra pilotens kontrollerte rapport. Hovedfunnet skal komme tidlig og overgangen til konkrete poster skal være tydelig.
2. Revider et avsnitt som feilaktig hevder at hele pandemiøkningen ble permanent. Vis at utvalgte poster ikke avstemmer totalen og unngå å gjenta totalserien.
3. Skriv ett LinkedIn-utkast fra samme grunnlag, med fast serietittel, én vri, tørr humor og et lenkeløfte teksten kan innfri.

Eksempel på svak formulering som skal prøves, ikke publiseres:
> Utgiftene var fortsatt høye etter pandemien. Derfor ble koronatiltakene permanente.

God retning:
> Dagpengeutgiftene falt, og en navngitt kompensasjonsordning krympet. Samtidig kom andre utgifter til. At totalen holdt seg høy, viser derfor ikke at de samme krisetiltakene fortsatte.

Dette illustrerer resonnementet og er ikke en validert artikkel eller et nytt faktagrunnlag.

## Hva vi registrerer
| Felt | Innhold |
| --- | --- |
| Grunnlag | Rapporthash og kildecommit |
| Varianter | Begge komplette tekster og instrukser |
| Vurdering | Håndbokens fem dimensjoner, med konkrete begrunnelser |
| Faktastopp | Feil, overdrivelser eller manglende avgjørende kilder |
| Brukerens valg | X, Y, begge svake eller ingen preferanse |
| Læringspunkt | Konkret endring, omfang og eventuell bekreftet varig regel |

Først etter flere saker kan vi vurdere om forbedringen holder. Senere bør vi reservere nye, ubrukte saker til evaluering, så vi ikke bare tilpasser Sven til piloten.
