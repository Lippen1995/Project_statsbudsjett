import { accountingObservation } from "./accounting-drill.js";
import { benchmarkObservations, population } from "./comparison.js";
import { historicalMunicipalityCode, occupationObservation } from "./occupation-observation.js";

const minimumPeers = 3;
const minimumGap = 0.10;
const internalHourlyCost = 900;
const leaderWageCodes = ["1342", "1343", "1344"];

function assess(own, observations, method) {
  const reference = benchmarkObservations(observations, method);
  const comparable = Number.isFinite(own) && own >= 0 && reference.value > 0 && reference.count >= minimumPeers;
  const gap = comparable ? own / reference.value - 1 : null;
  const status = gap === null ? "missing" : gap >= minimumGap ? "review" : "hold";
  return { own, reference, gap, status };
}

function implementation(hours, external = [0, 0]) {
  return hours.map((value, i) => value * internalHourlyCost + external[i]);
}

function staffing(target, peers, year, method, occupations, wages) {
  const read = (detail) => occupationObservation(occupations, detail, year, "07a");
  const { rate, amount } = read(target);
  const check = assess(rate, peers.map((peer) => {
    const value = read(peer);
    return { p: { perCapita: value.rate, amount: value.amount }, population: population(peer, year) };
  }), method);
  const salary = leaderWageCodes.map((code) => wages?.[code] ?? null);
  const hasWages = salary.every((value) => value > 0);
  const excess = rate > 0 && amount > 0 && check.status === "review" ? amount * check.gap / (1 + check.gap) : 0;
  const maxFte = Math.min(2, Math.floor(excess * 0.25));
  const saving = maxFte >= 1 && hasWages
    ? [Math.min(...salary) * 12 * 1.20, maxFte * Math.max(...salary) * 12 * 1.35] : null;
  return {
    ...check, id: "management", title: "Se på ledige lederstillinger i omsorg", unit: "årsverk per 1 000 innbyggere",
    sources: ["14533", "11418"],
    action: "Ved naturlig avgang kan kommunen vurdere å la én lederstilling stå ubesatt eller samle overlappende lederoppgaver.",
    guard: "Gå bare videre hvis lederne som blir igjen har kapasitet til faglig oppfølging, og oppgavene ikke skyves over på sykepleiere eller andre i turnus. Statistikken gjelder omsorgstjenestene samlet.",
    basis: saving
      ? `Scenarioet bruker ${maxFte === 1 ? "ett lederårsverk" : "1–2 lederårsverk"}, maksimalt en fjerdedel av beregnet avvik og maks to stillinger. Årslønn er 12 × nasjonal median månedslønn for heltidsledere i kommunehelse, eldreomsorg og sosialomsorg (${Math.min(...salary)}–${Math.max(...salary)} kr/mnd). Det er lagt til 20–35 % for arbeidsgiverkostnader som pensjon og arbeidsgiveravgift. Forutsetter ledige stillinger og helårsvirkning.`
      : "Et kroneanslag krever publisert referanselønn og et bemanningsavvik stort nok til at minst én stilling får plass i regneeksempelet.",
    saving,
    setup: implementation([80, 220]),
    setupReason: "80–220 interne timer til kartlegging av lederansvar, involvering av tillitsvalgte og overføring av oppgaver. Forutsetter naturlig avgang. Eventuelle sluttpakker og overtidskostnader må vurderes særskilt.",
  };
}

function purchases(target, peers, year, method) {
  const read = (detail) => accountingObservation(detail, year, "120", "A270");
  const own = read(target);
  const check = assess(own.perCapita, peers.map((peer) => {
    const p = read(peer);
    return { p, population: p.population };
  }), method);
  const gap = check.status === "review" ? (own.perCapita - check.reference.value) * own.population : 0;
  return {
    ...check, id: "purchases", title: "Gjennomgå eksterne avtaler i administrasjonen", unit: "kr per innbygger",
    sources: ["12367"],
    action: "Gå gjennom art 270 for parallelle rammeavtaler og kjøp som kan reforhandles eller samles ved fornyelse.",
    guard: "Art 270 omfatter blant annet rådgivning og vikartjenester. Bruk avtale- og fakturadata til å avgrense bakgrunnsarbeid, og hold tjenestenære vikariater og lovpålagte oppgaver utenfor.",
    saving: gap > 0 ? [gap * 0.05, gap * 0.15] : null,
    basis: "Regneeksempelet tar 5–15 % av kroneavviket mot referansen ved kommunens folketall. Andelen er en antakelse om hvor mye som kan ligge i avtaler som er mulige å endre.",
    setup: implementation([60, 160], [0, 50000]),
    setupReason: "60–160 interne timer til fakturagjennomgang og reforhandling, pluss 0–50 000 kr til innkjøps- eller juridisk bistand.",
  };
}

function energy(target, peers, year, data, fn, title) {
  const read = (detail) => data?.[fn]?.[historicalMunicipalityCode(detail, year)] ?? [];
  const [amount, rate] = read(target);
  const check = assess(rate, peers.map((peer) => ({ p: { perCapita: read(peer)[1] } })), "median");
  return {
    ...check, id: fn, title, unit: "kr per m²",
    sources: ["12151"], referenceLabel: "median i utvalget",
    action: "Test bedre tidsstyring av varme og ventilasjon utenom åpningstid i bygg der eksisterende styringssystem tillater det.",
    guard: "Kontroller energiforbruk i kWh, energipriser og brukstid først. Behold krav til temperatur og luftkvalitet i brukstiden. Høy kr/m² kan skyldes pris eller bygningsmasse.",
    saving: check.status === "review" && amount > 0
      ? [0.02, 0.05].map((share) => amount * 1000 * Math.min(share, check.gap / (1 + check.gap))) : null,
    basis: "Illustrerer 2–5 % lavere rapporterte energiutgifter, avgrenset til det relative avviket mot referansen. Satsen er en antakelse for driftstiltak. Faktisk virkning må måles i pilotbygg.",
    setup: implementation([40, 120], [20000, 100000]),
    setupReason: "40–120 interne timer til kartlegging, justering og måling, pluss 20 000–100 000 kr til teknisk bistand og innregulering. Forutsetter eksisterende styringsanlegg.",
  };
}

export function svenMeasures({ target, peers, year, method, occupations, inputs }) {
  const distinctPeers = [...new Map(peers.filter((peer) => peer.entity.code !== target.entity.code)
    .map((peer) => [peer.entity.code, peer])).values()];
  return [
    staffing(target, distinctPeers, year, method, occupations, inputs?.wages),
    purchases(target, distinctPeers, year, method),
    energy(target, distinctPeers, year, inputs?.energy, "130", "Juster energistyringen i administrasjonslokaler"),
    energy(target, distinctPeers, year, inputs?.energy, "222", "Juster energistyringen i skolebygg"),
  ].map((measure) => measure.status === "review" && !measure.saving
    ? { ...measure, status: "unpriced" } : measure);
}

export { internalHourlyCost, minimumGap, minimumPeers };
