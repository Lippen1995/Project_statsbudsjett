import { factText, number } from '../../web/src/analyser/model.js'
import { contentHash } from './schema.mjs'
export function renderReview(article) {
  const { copy: c, report: r } = article,
    t = (s) => factText(s, r)
  // Plain AI text is escaped so markdown cannot introduce disguised links or tags.
  const escape = (s) =>
    t(s)
      .replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' })[c])
      .replace(/([\\`*_\[\]])/g, '\\$1')
  return [
    '# Til godkjenning: analyse og LinkedIn-innlegg',
    'Les begge tekstene under. **Vil du endre noe? Skriv ønsket i en vanlig kommentar. AI reviderer og ber om ny godkjenning.** Bruk GitHubs «Review changes → Approve» når denne versjonen er klar. Å slå sammen manuelt publiserer ikke et utkast.',
    '**Varsler:** Følg denne gjennomgangen i GitHub-appen og aktiver pushvarsler for review requests. Innsyn følger repositoryets tilgang; dette er ikke en separat privat kanal.',
    `Versjon: \`${contentHash(article)}\` · Datagrunnlag: ${r.dataUpdated} · Regnskap ${r.start}–${r.end}`,
    '## LinkedIn-utkast',
    escape(c.linkedin),
    `Lenke etter publisering: https://fellestall.no/analyser/${article.slug}/`,
    '---',
    `# ${escape(c.title)}`,
    escape(c.lead),
    '## Hovedfunn',
    escape(c.conclusion),
    ...c.sections.flatMap((s) => [`## ${escape(s.heading)}`, ...s.paragraphs.map(escape)]),
    '## Metode',
    ...r.methodology,
    '## Begrensninger',
    ...r.limitations.map((s) => `- ${s}`),
    '## Kilder',
    ...r.sources.map((s) => `- [${s.name}](${s.url}) — ${s.description}`),
    '## Kontrollgrunnlag',
    ...Object.values(r.facts).map((f) => `- ${f.label}: **${f.text}**`),
    [
      '| År | Løpende kr/innbygger | Faste kr/innbygger | KPI |',
      '|---|---:|---:|---:|',
      ...r.rows.map(
        (row) =>
          `| ${row.year} | ${number(row.perCapita)} | ${number(row.realPerCapita)} | ${number(row.cpi, 1)} |`,
      ),
    ].join('\n'),
    '\nAI-støttet utkast. Beregningene er gjort i kode. Ingen publisering uten godkjenning av denne versjonen.',
  ].join('\n\n')
}
