# Gjenstående kontooppsett

Funksjonene er publisert og testet. Disse tilkoblingene krever kontoeierens
handlinger og skal ikke erstattes med agentens egne sesjonstilganger.

## E-post

1. Koble Resend til Vercel-prosjektet `fjord-insight/fellestall` i Production:
   https://vercel.com/marketplace/resend
2. Bekreft avsenderdomenet i Resend med de faktisk oppgitte DNS-postene.
   Bruk leverandørens avsendersubdomene; behold eksisterende e-postruting og
   eksisterende SPF-/MX-oppsett for andre e-posttjenester.
3. Vercel Production trenger `RESEND_API_KEY` som Secret og
   `FELLESTALL_EMAIL_FROM` som Config med en bekreftet avsenderadresse, for
   eksempel `no-reply@fellestall.no`. Nøkler skal ikke sendes i chatten.
4. Publiser gjeldende kontrollerte versjon på nytt etter variabelendringene.
5. Send testmail fra Varsler til innlogget administrators egen konto og
   kontroller mottak og leveringsloggen før invitasjoner og oppsummeringer tas
   i bruk. Tilbakestillingslenker er engangslenker og utløper etter én time.

Checklys bekreftede driftsvarsler er en separat kanal og fungerer uten Resend.
Det er ikke sendt noen Resend-mail av implementeringstestene.

## GitHub

Rediger eksisterende fine-grained token `Fellestall_admin` på riktig GitHub-konto:
https://github.com/settings/personal-access-tokens

Behold tilgang til bare `Lippen1995/Project_statsbudsjett`. For hele arbeidsflyten
trengs følgende repository permissions:

- Contents: Read and write – versjonerte arbeidsfiler og pipeline.
- Pull requests: Read and write – kommentarer, revisjon og godkjenning av PR.
- Actions: Read and write – bestillinger av eksisterende, avgrensede jobber.
- Metadata: Read-only – følger automatisk med.

Pull requests write autoriserer også kommentarer til pull requests via
GitHubs issue-comment-endepunkt. Det er ikke nødvendig å gi separat Issues-
eller Workflows-skrivetilgang. Endring av rettighetene på eksisterende token
krever normalt ikke en ny tokenverdi i Vercel.

Nye skriverettigheter må kontrolleres i den faktiske gjennomgangsflyten. Ingen
produksjonsanalyse er godkjent, revidert, trukket tilbake eller distribuert bare
for å teste oppsettet. Rettighetsfeil vises eksplisitt, og versjonsvern og
menneskelig godkjenning gjelder fortsatt.
