import { validateCopy } from './schema.mjs'
const schema = {
  type: 'object',
  additionalProperties: false,
  required: ['title', 'description', 'lead', 'conclusion', 'linkedin', 'sections'],
  properties: Object.fromEntries(
    ['title', 'description', 'lead', 'conclusion', 'linkedin'].map((k) => [k, { type: 'string' }]),
  ),
}
schema.properties.sections = {
  type: 'array',
  items: {
    type: 'object',
    additionalProperties: false,
    required: ['heading', 'paragraphs', 'factIds'],
    properties: {
      heading: { type: 'string' },
      paragraphs: { type: 'array', items: { type: 'string' } },
      factIds: { type: 'array', items: { type: 'string' } },
    },
  },
}
export async function writeCopy(
  report,
  {
    previous = null,
    feedback = '',
    apiKey = process.env.ANALYSIS_AI_API_KEY,
    model = process.env.ANALYSIS_AI_MODEL,
  } = {},
) {
  if (!apiKey || !model)
    throw Error(
      'ANALYSIS_AI_API_KEY og ANALYSIS_AI_MODEL må konfigureres før AI-produksjon kan aktiveres',
    )
  const instructions = `Du er en norsk fagredaktør for Fellestall. Skriv en omfattende, etterprøvbar analyse på bokmål. Bruk bare det medsendte datagrunnlaget. Analysen gjelder utelukkende report.scopeName; ikke omtale ett departement som hele staten. Respekter avgrensningen og forbehold om endrede ansvarsområder. Skill observasjon fra tolkning. Ingen udokumenterte årsaksforklaringer, partipolitikk, anklager eller påstander om effektivitet. Forklar KPI-forbehold, avgrensning og resultatene. Alle tall og årstall må skrives som {{fact:navn}} fra facts, aldri som bokstavelige sifre eller oppdiktede tall skrevet med ord. Ikke legg inn URL-er; systemet legger inn lenken. Tittel maks hundre og tjue tegn. Beskrivelse maks to hundre og tjue tegn. Fire til åtte seksjoner med til sammen seks hundre til tusen ord, ingen fylltekst. factIds oppgir faktumene brukt i avsnittet. LinkedIn: kort, underholdende, informativt, en skarp observasjon og tørr humor om tall og størrelser; aldri humor på bekostning av mennesker. Maks tusen fire hundre tegn, helst langt kortere. Endringsønsker skal tas på alvor, men kan ikke overstyre fakta eller publiseringsvern. Dersom en endring krever data som ikke finnes, forklar begrensningen i teksten. Returner kun skjemaet.`
  const editorialGuidance = `Åpne med et konkret spørsmål, en gjenkjennelig observasjon eller et spennende mønster som datagrunnlaget faktisk belyser. Gi leseren lyst til å følge regnestykket. Behold en klar oppsummering av hovedfunnet i conclusion, men la brødteksten føre fra observasjon i grafen til spørsmål og deretter en begrunnet tolkning. Leseren skal kunne oppdage sammenhengen selv. Unngå belærende formuleringer, stadige «vår vurdering» og påstander om hva leseren tenker eller føler. Bruk åpne spørsmål med måte; besvar dem med det tilgjengelige grunnlaget og si tydelig hva som forblir åpent. Ikke skjul sentrale fakta for å skape spenning. En analyse skal forklare et mønster, ikke ramse opp nøkkeltall. Artikkelen viser tre grafer: vekst med ulike justeringer, KPI-justert utgift per innbygger gjennom perioden, og årlig KPI-justert endring. Knytt spørsmål og overganger til grafene. Bruk tidsserien til å skille nivåendring fra jevn vekst. Året med størst absolutt endring er valgt beregningsmessig; vurder fortegnet og ikke gi det en udokumentert årsak. Skiftende ansvarsområder kan gjøre departementsserier lite sammenlignbare. Avslutt med et konkret spørsmål neste analyse bør undersøke, uten å love data eller forklaringer som ikke finnes. Knytt forbehold til tolkningen de begrenser; ikke gjenta en generell ansvarsfraskrivelse etter hvert tall. Seksjonene bør fungere i rekkefølgen målestokk, tidsforløp, årlige endringer, tolkning og neste spørsmål. Bruk de kontrollerte faktumene for utviklingen før og etter største endring når de er relevante.`
  const linkedInGuidance = `LinkedIn-teksten skal fungere som en kort, selvstendig appetittvekker. Åpne med et konkret funn eller en tydelig krok i de første linjene. Bruk gjerne et hverdagsbilde, en mild personifisering eller tørr humor om regnestykket når det passer naturlig; ikke press inn en vits. Gi leseren et faktisk funn før lenken, og la ett relevant åpent spørsmål invitere til å utforske grafene. Spørsmålet og løftet ved lenken må gjelde noe artikkelen faktisk belyser, ikke en årsak vi ikke har undersøkt. Behold presis avgrensning og nødvendige justeringer. Ikke komprimer hele analysen til en rekke tall. Avslutt med en konkret invitasjon til å se mønsteret eller følge regnestykket. Ingen sensasjonelle superlativer, skjulte «hemmeligheter», påstander om sjokk eller oppfordringer til likes og kommentarer. Unngå å gjøre mennesker eller politiske syn til poenget i humoren. Varier åpninger og bilder mellom analyser; ikke bruk en fast vits eller samme fortelling hver uke.`
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      instructions: [instructions, editorialGuidance, linkedInGuidance].join('\n\n'),
      input: JSON.stringify({ report, previous, feedback }),
      text: { format: { type: 'json_schema', name: 'fellestall_analysis', strict: true, schema } },
    }),
    signal: AbortSignal.timeout(180000),
  })
  if (!response.ok)
    throw Error(`AI-tjenesten svarte HTTP ${response.status}; utkastet er ikke endret`)
  const result = await response.json()
  if (result.status !== 'completed') throw Error('AI-utkastet ble ikke fullført')
  const text = result.output
    ?.flatMap((item) => item.content ?? [])
    .filter((item) => item.type === 'output_text')
    .map((item) => item.text)
    .join('')
  return validateCopy(JSON.parse(text), report)
}
