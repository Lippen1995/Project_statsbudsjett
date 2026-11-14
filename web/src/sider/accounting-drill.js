import { accountingArtValue } from "../kostra/explorer.js";
import { benchmarkObservations, population } from "./comparison.js";

export const OWN_PURCHASES = "AGD50";
export const PURCHASE_REMAINDER = "purchase-remainder";
export const PURCHASE_BREAKDOWN_NOTE =
  "SSB publiserer art 260 og 270 separat. Øvrige kjøp er totalen minus disse to artene. Referansen beregnes for hver rad.";
const purchaseArtNames = {
  A260: "Renholds- og vaskeritjenester",
  A270: "Andre tjenester",
  [PURCHASE_REMAINDER]: "Øvrige kjøp (beregnet)",
};

// Each post uses one published main group. Children are disclosures within the
// group, so they are never added to the group's amount.
export const ACCOUNT_SECTIONS = [
  ["Brutto driftsutgifter", [
    ["AG16", "Lønn og sosiale utgifter etter sykelønnsrefusjon", ["A090", "A099", "A710"]],
    [OWN_PURCHASES, "Varer og tjenester til egen produksjon", ["A260", "A270", PURCHASE_REMAINDER]],
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
  const arts = detail?.accountingArts?.[functionCode];
  const art = arts?.find(({ code }) => code === artCode);
  const purchaseArts = detail?.purchaseArts?.functionCode === functionCode
    ? detail.purchaseArts.data : null;
  const publishedAmount = (code) =>
    accountingArtValue(arts?.find((item) => item.code === code), year, detail?.latestYear)?.amount;
  const purchaseAmount = (code) => publishedAmount(code)
    ?? purchaseArts?.rows[detail.entity.code]?.[year]?.[purchaseArts.columns.indexOf(code)];
  const value = accountingArtValue(art, year, detail?.latestYear)
    ?? (artCode === "AGD10" ? detail?.functions?.find(({ code }) => code === functionCode)
      ?.metrics?.gross_expenses?.[year] : null);
  let amount = value?.amount ?? null;
  if (artCode === PURCHASE_REMAINDER) {
    const total = publishedAmount(OWN_PURCHASES);
    const cleaning = purchaseAmount("A260");
    const other = purchaseAmount("A270");
    if ([total, cleaning, other].every(Number.isFinite)) amount = total - cleaning - other;
  } else if (artCode === "A260" || artCode === "A270") {
    amount ??= purchaseAmount(artCode) ?? null;
  }
  const inhabitants = population(detail, year);
  return {
    name: purchaseArtNames[artCode] ?? art?.name,
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
