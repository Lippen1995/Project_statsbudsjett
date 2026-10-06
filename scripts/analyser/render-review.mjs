import { factText, number } from '../../web/src/analyser/model.js'
import { contentHash } from './schema.mjs'
import { graphPlan, seriesGraph } from '../../web/src/analyser/chart-plan.js'
import { priorityKinds } from './party-priorities.mjs'
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
    '**Endringsønsker:** Behandles ved neste kjøring av den planlagte AI-oppgaven. Du kan også be om revisjon tidligere i oppgavens chat. GitHub-kommentaren starter ikke i seg selv en ny AI-kjøring. Ubehandlede ønsker stopper publisering.',
    `Versjon: \`${contentHash(article)}\` · Datagrunnlag: ${r.dataUpdated} · ${r.kind === 'budget-comparison' ? 'Budsjett' : 'Regnskap'} ${r.start}–${r.end}`,
    '## LinkedIn-utkast',
    escape(c.linkedin),
    ...(article.replaces
      ? [
          `**Erstatter tidligere analyse etter ny godkjenning:** https://fellestall.no/analyser/${article.replaces.slug}/ · tidligere innholdshash \`${article.replaces.contentHash}\``,
        ]
      : []),
    `Lenke etter publisering: https://fellestall.no/analyser/${article.slug}/`,
    '---',
    `# ${escape(c.title)}`,
    escape(c.lead),
    '## Hovedfunn',
    escape(c.conclusion),
    ...c.sections.flatMap((s) => [`## ${escape(s.heading)}`, ...s.paragraphs.map(escape)]),
    '## Grafer i denne versjonen',
    ...(c.sections.length ? graphPlan(c, r) : []).flatMap((g) => {
      if (g.kind !== 'series') return [`- ${g.kind}, etter avsnitt ${g.afterSection + 1}`]
      const data = seriesGraph(g, r)
      return [
        escape(g.title ?? 'Utvalgte tidsserier'),
        `${data.years[0]}–${data.years.at(-1)} · ${data.indexed ? `Indeks, ${data.baseYear} = 100` : data.unit}`,
        [
          '| År | ' + data.series.map((s) => escape(s.label)).join(' | ') + ' |',
          '|---|' + data.series.map(() => '---:|').join(''),
          ...data.years.map(
            (y, i) => `| ${y} | ${data.series.map((s) => number(s.values[i], 2)).join(' | ')} |`,
          ),
        ].join('\n'),
      ]
    }),
    ...(r.eventEvidence
      ? [
          '## Hendelser og konkrete regnskapsposter',
          'Utvalgte eksempler, ikke et fullstendig kriseregnskap eller en fordeling av hele veksten. Løpende mill. kroner. «—» betyr ingen regnskapsføring på denne posten i uttrekket.',
          ...r.eventEvidence.items.flatMap((item) => [
            `### ${item.title}`,
            `${item.event}. ${item.context}`,
            ...item.nodes.map((node) => `- ${node.id}: ${node.name}`),
            [
              '| År | Bokført beløp, mill. kr |',
              '|---|---:|',
              ...item.rows.map(
                (row) => `| ${row.year} | ${row.reported ? number(row.expenditure, 1) : '—'} |`,
              ),
            ].join('\n'),
          ]),
        ]
      : []),
    ...(r.politicalEvidence?.length
      ? [
          '## Dokumentert parlamentarisk behandling',
          ...r.politicalEvidence.flatMap((e) => [
            `${e.parties.join(', ')} · ${e.kind} · poster ${e.recordKeys.join(', ')}`,
            escape(e.quote),
            `[Offisiell kilde](${e.url})`,
          ]),
        ]
      : []),
    ...(r.partyPriorities?.length
      ? [
          '## Kontrollerte partiprioriteringer',
          'Programmer og uttalte prioriteringer dokumenterer partiets mål. De dokumenterer ikke forhandlingsgjennomslag i dette budsjettet.',
          ...r.partyPriorities.flatMap((p) => [
            `${p.party} · ${priorityKinds[p.kind]}${p.period ? ' · programperiode ' + p.period.join('–') : p.referenceYear ? ' · opprinnelig budsjettår ' + p.referenceYear : ''}${p.recordKeys.length ? ' · poster ' + p.recordKeys.join(', ') : ''}`,
            escape(p.quote),
            `[Partiets originalkilde](${p.url}) · ${p.sourceDate ? 'publisert ' + p.sourceDate : 'publiseringsdato ikke bekreftet'} · hentet ${p.retrievedAt}`,
          ]),
        ]
      : []),
    '## Metode',
    ...r.methodology,
    '## Begrensninger',
    ...r.limitations.map((s) => `- ${s}`),
    '## Kilder',
    ...r.sources.map((s) => `- [${s.name}](${s.url}) — ${s.description}`),
    '## Kontrollgrunnlag',
    ...Object.values(r.facts).map((f) => `- ${f.label}: **${f.text}**`),
    r.kind === 'budget-comparison'
      ? [
          `| Post | ${r.beforeLabel} | ${r.afterLabel} | Endring, mill. kr |`,
          '|---|---:|---:|---:|',
          ...[...r.rows]
            .sort((a, b) => Math.abs(b.change) - Math.abs(a.change))
            .slice(0, 20)
            .map(
              (row) =>
                `| ${row.id} | ${number(row.before, 1)} | ${number(row.after, 1)} | ${number(row.change, 1)} |`,
            ),
        ].join('\n')
      : [
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
