import { accountingArtValue } from "../kostra/explorer.js";
import { benchmarkObservations, population } from "./comparison.js";

// Each post uses one published main group. Children are disclosures within the
// group, so they are never added to the group's amount.
export const ACCOUNT_SECTIONS = [
  ["Brutto driftsutgifter", [
    ["AG16", "Lønn og sosiale utgifter etter sykelønnsrefusjon", ["A090", "A099", "A710"]],
    ["AGD50", "Varer og tjenester til egen produksjon"],
    ["AGD51", "Kjøp av tjenester som erstatter egen produksjon"],
    ["AG34", "Overføringsutgifter ekskl. merverdiavgift"],
    ["A590", "Avskrivninger"],
  ]],
  ["Rapporterte driftsinntekter", [
    ["A600", "Brukerbetalinger"],
    ["AGD34", "Andre salgs- og leieinntekter"],
    ["AG48", "Overføringsinntekter med krav til motytelse"],
    ["AGD49", "Overføringsinntekter uten krav til motytelse"],
  ]],
  ["Finansinntekter", [
    ["AGD28", "Finansinntekter og finanstransaksjoner"],
  ]],
];

export function accountingObservation(detail, year, functionCode, artCode) {
  const art = detail?.accountingArts?.[functionCode]?.find(({ code }) => code === artCode);
  const value = accountingArtValue(art, year, detail?.latestYear)
    ?? (artCode === "AGD10" ? detail?.functions?.find(({ code }) => code === functionCode)
      ?.metrics?.gross_expenses?.[year] : null);
  const amount = value?.amount ?? null;
  const inhabitants = population(detail, year);
  return {
    name: art?.name,
    amount,
    perCapita: Number.isFinite(amount) && inhabitants > 0 ? amount * 1000 / inhabitants : null,
    population: inhabitants,
  };
}

export function accountingBenchmark(details, year, functionCode, artCode, method) {
  return benchmarkObservations(details.map((detail) => {
    const p = accountingObservation(detail, year, functionCode, artCode);
    return { p, population: p.population };
  }), method);
}

export function accountingComparison(target, peers, year, functionCode, artCode, method, other) {
  const own = accountingObservation(target, year, functionCode, artCode);
  const compared = (other ? [other] : peers).map(
    (detail) => accountingObservation(detail, year, functionCode, artCode),
  );
  const { value, count } = benchmarkObservations(
    compared.map((p) => ({ p, population: p.population })),
    other ? "median" : method,
  );
  return {
    name: own.name ?? compared.find((item) => item.name)?.name ?? artCode,
    own,
    reference: value,
    count,
    reported: Number.isFinite(own.amount) || compared.some((item) => Number.isFinite(item.amount)),
  };
}
