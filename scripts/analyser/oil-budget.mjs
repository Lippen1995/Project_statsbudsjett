import { existsSync, readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
const hash = (s) => createHash('sha256').update(s).digest('hex')
const clean = (s) => s.replace(/<[^>]*>/g, ' ').replace(/&nbsp;|&#160;/g, ' ').replace(/\s+/g, ' ').trim()
const num = (s) => Number(s.replace(/\s/g, '').replace(',', '.'))
export function parseOilBudget(html, year) {
  if (!html.includes(`Nasjonalbudsjettet ${year}`)) throw Error('Feil nasjonalbudsjettår')
  const tables = [...html.matchAll(/<table\b[^>]*>[\s\S]*?<\/table>/g)].map((m) => ({
    text: clean(m[0]),
    rows: [...m[0].matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/g)].map((r) => [...r[1].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/g)].map((c) => clean(c[1]))),
  }))
  const table = (label) => {
    const found = tables.filter((t) => t.text.includes(label))
    if (found.length !== 1) throw Error('Ukjent budsjettabell: ' + label)
    return found[0].rows
  }
  const main = table('Totale inntekter'), structural = table('Særskilte regnskapsforhold'), ukraine = table('Donasjoner av militært materiell')
  const values = (rows, label) => {
    const found = rows.filter((r) => r[0]?.replace(/^[+−=\-]\s*/, '').includes(label))
    if (found.length !== 1 || found[0].length !== 4) throw Error('Ukjent budsjettrad: ' + label)
    const result = found[0].slice(1).map(num)
    if (result.some((n) => !Number.isFinite(n))) throw Error('Ugyldig budsjetttall')
    return result
  }
  for (const rows of [main, structural])
    if (!rows.some((r) => r.slice(-3).join(',') === `${year - 2},${year - 1},${year}`)) throw Error('Ukjente budsjettår')
  const transfers = values(main, 'Overføring fra Statens pensjonsfond utland')
  const nonOilIncome = values(main, 'Inntekter utenom petroleumsinntekter')
  const nonOilExpenses = values(main, 'Utgifter utenom petroleumsvirksomhet')
  const deficits = values(structural, 'Oljekorrigert underskudd på statsbudsjettet')
  const totals = values(structural, 'Strukturelt oljekorrigert budsjettunderskudd')
  const rows = transfers.map((transfer, i) => ({year: year - 2 + i, transfer, nonOilIncome: nonOilIncome[i], nonOilExpenses: nonOilExpenses[i], deficit: deficits[i], structural: totals[i]}))
  if (rows.some((r) => Math.abs(r.nonOilExpenses - r.nonOilIncome - r.deficit) > .2 || r.transfer <= 0)) throw Error('Budsjettbalansen avviker')
  const ukraineRows = ukraine.filter((r) => /^20\d\d$/.test(r[0])).map((r) => ({year: num(r[0]), total: num(r[1]), appropriation: num(r[2]), donated: num(r[3])}))
  if (ukraineRows.length !== 6 || ukraineRows.some((r, i) => r.year !== year - 5 + i || ![r.total,r.appropriation,r.donated].every(Number.isFinite) || Math.abs(r.total - r.appropriation - r.donated) > .15)) throw Error('Ukraina-tabellen avviker')
  const text = clean(html)
  const extract = (re) => {const m=text.match(re); if(!m) throw Error('Budsjettomtale mangler'); return num(m[1])}
  const reacquisition = extract(new RegExp(`I ${year} foreslår regjeringen ([\\d ,]+) mrd\\. kroner til gjenanskaffelser`))
  const financingNeed = extract(/inndekningsbehov på ([\d ,]+) mrd\. kroner per år/)
  if (!text.includes('med samme fordeling mellom militær og sivil støtte') || !text.includes('midlertidig høy skatteinngang') || !text.includes('avvikle ordningen med skattetrekkskonto')) throw Error('Finansieringsforklaring mangler')
  return {rows, ukraineRows, reacquisition, financingNeed}
}
export function buildOilBudget(dataDir, year) {
  const path = `${dataDir}/oil-funds/${year}-budget`
  if (!existsSync(path + '.json')) return null
  const source = JSON.parse(readFileSync(path + '.json', 'utf8')), html = readFileSync(path + '.html', 'utf8')
  if (hash(html) !== source.sha256 || !/^https:\/\/www\.regjeringen\.no\/no\/dokumenter\/meld\.-st\.-1-\d{4}\d{4}\/id\d+\/\?ch=3$/.test(source.url) || !Number.isFinite(Date.parse(source.checkedAt))) throw Error('Ugyldig budsjettarkiv')
  return {...parseOilBudget(html, year), source}
}
export function oilBudgetFacts(budget) {
  if (!budget) return {}
  const last=budget.rows.at(-1), previous=budget.rows.at(-2), f={}
  const add=(id,value,label,unit=' mrd. kr')=>{f[id]={value,label,text:value.toLocaleString('nb-NO',{minimumFractionDigits:1,maximumFractionDigits:1})+unit}}
  add('transfer',last.transfer,'Foreslått fondsoverføring')
  add('previousTransfer',previous.transfer,'Oppdatert anslag på fondsoverføring året før')
  add('transferChange',last.transfer-previous.transfer,'Økning i fondsoverføringen')
  add('transferGrowth',(last.transfer/previous.transfer-1)*100,'Vekst i fondsoverføringen',' %')
  add('nonOilIncome',last.nonOilIncome,'Inntekter utenom petroleum')
  add('incomeShare',last.transfer/(last.nonOilIncome+last.transfer)*100,'Fondsoverføring som andel av inntekter utenom petroleum inkludert fondsoverføring',' %')
  add('reacquisition',budget.reacquisition,'Gjenanskaffelser av donert materiell')
  add('financingNeed',budget.financingNeed,'Gjennomsnittlig årlig teknisk inndekningsbehov etter budsjettåret')
  for(const [suffix,row]of [['Start',budget.ukraineRows.at(-3)],['Previous',budget.ukraineRows.at(-2)],['Current',budget.ukraineRows.at(-1)]]) {
    add('ukraine'+suffix+'Budget',row.appropriation,'Nansen-bevilgning '+row.year)
    add('ukraine'+suffix+'Donation',row.donated,'Materielldonasjoner '+row.year)
  }
  add('ukraineBudgetChange',budget.ukraineRows.at(-1).appropriation-budget.ukraineRows.at(-2).appropriation,'Økt Nansen-bevilgning')
  return f
}
