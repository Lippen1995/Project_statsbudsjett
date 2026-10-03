# LinkedIn-side for Fellestall.no

Status 2. oktober 2026: brukeren har opprettet LinkedIn-siden **Fellestall.no** og delt administratorlenken med side-ID **146686168**. Det vedlagte skjermbildet viser sidens administrasjonspanel og en oppfordring til å legge til beskrivelse. Profilendringer etter skjermbildet og den offentlige besøksadressen er ikke kontrollert. Det er ingen innlogget LinkedIn-forbindelse i denne utviklingsøkten, og automatisk publisering er ikke aktivert.

## Bekreftet side og konfigurasjon

- Appen **Fellestall publisering** er opprettet med Fellestall-logoen, bekreftet i brukerens skjermbilder 2. oktober 2026. Brukeren har deretter bekreftet at tilknytningen til **Fellestall.no** er verifisert. Brukeren opplyser at søknaden om **Community Management API – Development Tier** er sendt og avventer svar på e-post. Tilgang er ikke bekreftet innvilget. Ingen privacy policy URL var registrert i siste Settings-skjermbilde. App-ID er ikke bekreftet.
- Sidenavn fra skjermbildet: **Fellestall.no**.
- Administratorlenke fra brukeren: `https://www.linkedin.com/company/146686168/admin/dashboard/`.
- Side-ID fra lenken: `146686168`.
- GitHub Actions-variabel: `LINKEDIN_ORGANIZATION_ID=146686168`.
- API-avsender: `urn:li:organization:146686168`.

Side-ID-en er dokumentert her, men ikke lagret i de aktive repository-variablene. Etter nettverksendringen fungerer GitHubs API for repository- og PR-operasjoner, mens lesing av Actions-variabler og Secrets svarer `Resource not accessible by integration` (HTTP 403). Den eksisterende integrasjonen gir derfor ikke dokumentert tilgang til Actions-innstillingene. Ingen ekstern variabel eller secret er endret. Ikke hardkod ID-en i workflowfiler; distribusjonen leser repository-variabelen.

Administratorlenken er ikke en besøkslenke som skal deles i innlegg. LinkedIn-innleggene skal lenke til den godkjente analysen på fellestall.no. En eventuell profil-lenke på nettsiden må bruke sidens offentlige besøksadresse, som fortsatt må bekreftes. Ikke utled en navnebasert adresse fra sidenavnet.

## Anbefalt profil

Opprettet sidenavn: **Fellestall.no**. Foreslått navn på den ukentlige spalten: **Hvor ble pengene av?**. Spaltenavnet avventer brukerens valg. Siden skal representere prosjektet, og omtale forbindelsen til en virksomhet bare hvis brukeren bekrefter den.

Nettside: `https://fellestall.no/`.

Den offentlige besøksadressen til den opprettede siden er ikke bekreftet. En navnebasert adresse er ikke nødvendig for API-publiseringen; side-ID-en over identifiserer avsenderen.

**Slagord**, klart til innliming:

> Hvor ble pengene av? Offentlig pengebruk, forklart med tall, grafer og litt tørr humor.

**Om siden**, klart til innliming:

> En milliard her og en milliard der. Vi gjør regningen lesbar.
>
> Fellestall gjør tallene bak norsk offentlig pengebruk lettere å forstå. På fellestall.no kan du utforske statsbudsjettet, statsregnskapet og kommuneøkonomien med grafer, historikk og kroner per innbygger.
>
> I spalten «Hvor ble pengene av?» undersøker vi ett konkret spørsmål om pengebruken. Vi viser hva tallene sier, hvordan vi har regnet, og hva datagrunnlaget ikke kan fortelle. Hvert innlegg lenker til en grundigere analyse med metode og kilder.
>
> Tallene kommer fra navngitte offentlige kilder, blant annet DFØ og SSB. Analyseutkastene er laget med AI-støtte og gjennomgås av et menneske før publisering.
>
> Fellestall er et uavhengig prosjekt. Vi tar ikke partipolitisk side, og høy pengebruk blir ikke automatisk kalt sløsing. Regnskapet viser hva vi bruker; hva vi får igjen, krever flere spørsmål.
>
> Utforsk tallene: https://fellestall.no/

Teksten lover ikke ukentlige innlegg før produksjonen er aktivert. «Uavhengig prosjekt» og eventuell virksomhetstilknytning må være korrekt ved opprettelsen.

**Filer**:

- [Logo, PNG 512 × 512](../editorial/linkedin/logo.png): uendret kopi av Fellestalls eksisterende ikon.
- [Forsidebilde, PNG 1128 × 191](../editorial/linkedin/cover.png): samme papirfarge, skrifter og rustfarge som nettsiden.
- [Redigerbar forside](../editorial/linkedin/cover.html) og [SVG-versjon](../editorial/linkedin/cover.svg). LinkedIn bruker PNG-filen; kontroller beskjæringen i opplastingen.

## Opprettelsen fra brukerens profil

[Åpne opprettelse av LinkedIn-side](https://www.linkedin.com/company/setup/new/).

LinkedIn-siden administreres gjennom en ekte personlig profil; det opprettes ingen ny person som heter «Fellestall» eller et fiktivt ombud. Selve innloggingen og bekreftelsen av at brukeren kan representere prosjektet må gjøres i vedkommendes egen LinkedIn-økt. Passord og engangskoder skal ikke sendes i chat.

1. Velg sidetypen som passer prosjektets faktiske organisering. For en egen merkevare er virksomhetsside vanligvis aktuell; LinkedIn kan ha vilkår for hvem som kan opprette den.
2. Bruk det godkjente sidenavnet, offentlig adresse og nettside. Bransje, organisasjonstype og størrelse må gjenspeile faktisk virksomhet; de er ikke antatt her.
3. Last opp logoen og legg inn slagordet. Bekreft representasjonsrett bare hvis den faktisk foreligger.
4. Etter opprettelsen: legg inn «Om siden» og forsidebildet. Kontroller at lenken til nettsiden fungerer.
5. Lagre sidens offentlige besøksadresse ved behov for profillenker. Organisasjons-ID-en er hentet fra administratorlenken brukeren delte: `146686168`.

Ingen første LinkedIn-publisering er godkjent ved å opprette siden. Pilotinnlegget følger den avtalte redaksjonelle godkjenningen.

## Senere overføring

Brukeren er første sideadministrator. Sideadministrasjonen er separat fra godkjenningsrollen i GitHub. Godkjenningsansvaret overføres ved å bytte `ANALYSIS_REVIEWER`, se [analysedokumentasjonen](analyses.md#overføre-godkjenningsansvaret).

En senere administrator legges til under LinkedIn-sidens administratortilgang, fra sin egen profil. Gi rollen som passer ansvaret: innholdspublisering eller full sideadministrasjon. Bekreft at den nye administratoren har tilgang før den gamle mister sin. Publiseringstilgangen må eventuelt kobles til på nytt dersom OAuth-tilgangen er knyttet til en administrator som fjernes.

## Automatisk publisering er en egen tilkobling

En opprettet LinkedIn-side gir ikke automatisk API-tilgang. Vi trenger også en godkjent LinkedIn-app med nødvendig publiseringstilgang og OAuth-godkjenning for siden. Krav og sikre felter står i [engangsoppsettet](analyses.md#engangsoppsett-før-aktivering).

Appen **Fellestall publisering** er opprettet fra administratorens innloggede økt på LinkedIn Developers, knyttet til den ekte siden **Fellestall.no** og med Fellestall-logoen. Brukeren har bekreftet at sidetilknytningen er verifisert. Nødvendig tilgang til Community Management API må være på plass før OAuth-tilkoblingen prøves; verifiseringen er ikke en bekreftelse på at API-tilgang er innvilget.

Søknaden om Community Management API – Development Tier avventer e-post fra LinkedIn, ifølge brukeren 2. oktober 2026. Veiledningen tok utgangspunkt i bruk av egen side (**Direct Advertiser**) og publisering (**Page management**). Neste steg er å lese utfallet og kontrollere faktisk innvilget produkttilgang og OAuth-scopes. Ved godkjenning kobles administratoren til via OAuth, tilgangen lagres sikkert i GitHub og flyten verifiseres med en menneskelig godkjent analyse. En innsendt søknad er ikke et publiseringssignal.

Client secret og OAuth-token lagres i GitHub Actions Secrets, ikke i prosjektminnet eller chatten. `LINKEDIN_ENABLED` forblir deaktivert til tilgang, gjeldende API-versjon og en godkjent publiseringskjøring er kontrollert.

Hvis direkte API-tilgang ikke innvilges, må vi velge en publiseringstjeneste med en støttet LinkedIn-integrasjon. Det valget er ikke tatt, og ingen tjeneste eller betaling er bestilt. Nettsidens analyseproduksjon og godkjenning kan ferdigstilles uavhengig av LinkedIn-tilkoblingen.
