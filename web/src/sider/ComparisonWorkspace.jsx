import React, { useState } from "react";
import { accountingArtBreakdown } from "../kostra/explorer";
import { SECTORS } from "./comparison";
import { ACCOUNT_SECTIONS, OWN_PURCHASES, PURCHASE_BREAKDOWN_NOTE, PURCHASE_REMAINDER, accountingObservation } from "./accounting-drill";
import { usePurchaseArts, withPurchaseArts } from "./use-purchase-arts";
import CostChart, { CostTable } from "./CostChart";
import ComparisonDialog from "./ComparisonDialog";
import {
  comparisonRow,
  entityName,
  formatNumber as n,
  nominal,
  percent,
  referenceName,
} from "./workspace-model";
import "./workspace.css";

const SERVICE_LABELS = {
  FGK8b: "Skole",
  FGK9: "Helse / omsorg",
  FGK7: "Barnehage",
  FGK1b: "Administrasjon",
  FGK13: "Barnevern",
  FGK12: "Sosial",
  FGK2: "Kultur",
  FGK6a: "Eiendom",
  FGK5: "Samferdsel",
  FGK3: "Plan / miljø",
  FGK17: "Brann",
};

const POST_LABELS = {
  AG16: "Lønn",
  AGD50: "Varer / tjenester",
  AGD51: "Tjenestekjøp",
  AG34: "Overføringer",
  A590: "Avskrivning",
  A600: "Brukerbetaling",
  AGD34: "Salg / leie",
  AG48: "Motytelser",
  AGD49: "Andre overf.",
  AGD28: "Finans",
};

const EMPTY_PATH = { scope: "", post: "", art: "" };
const moneyPerPerson = (value) => Number.isFinite(value) ? `${n(value)} kr` : "–";

function ComparisonFacts({ title, summary, method, year, onMethod, account }) {
  const { own, reference } = summary;
  return (
    <section className="cmp-selected-facts" aria-label="Nøkkeltall">
      <div className="cmp-facts-head" aria-live="polite">
        <h3>{title}</h3>
        <span>{own.name} · kommunekonsern · {year}</span>
      </div>
      <dl className="cmp-facts-grid">
        <div>
          <dt>Per innbygger</dt>
          <dd>{moneyPerPerson(own.perCapita)}</dd>
        </div>
        <div>
          <dt>{referenceName(method)} per innbygger</dt>
          <dd>{moneyPerPerson(reference.perCapita)}</dd>
        </div>
        <div>
          <dt>Avvik fra {referenceName(method).toLowerCase()}</dt>
          <dd>{percent(summary.percent)}</dd>
        </div>
        <div className="secondary">
          <dt>{account?.code === PURCHASE_REMAINDER ? "Beregnet beløp" : account ? "Rapportert beløp" : "Totale netto driftsutgifter"}</dt>
          <dd>{nominal(own.amount)}</dd>
        </div>
        <div className="secondary">
          <dt>Folketall</dt>
          <dd>{own.population > 0 ? `≈ ${n(own.population)}` : "–"}</dd>
        </div>
        <div className="secondary">
          <dt>Referanse ved samme folketall</dt>
          <dd>{nominal(reference.amount)}</dd>
        </div>
      </dl>
      <p>
        Referansebeløpet er beregnet ved {own.name}s folketall.
        Referansen bygger på {reference.count} kommuner med data.
      </p>
      <div className="cmp-workspace-meta">
        <label>
          Referanse
          <select value={method} onChange={(e) => onMethod(e.target.value)}>
            <option value="median">Median i utvalget</option>
            <option value="weighted">Befolkningsvektet snitt</option>
          </select>
        </label>
      </div>
    </section>
  );
}

function MunicipalityRanking({ rows, target, year, title, onOpen }) {
  const maximum = Math.max(1, ...rows.map((row) => Math.abs(row.a ?? 0)));
  const hasNegative = rows.some((row) => row.a < 0);
  return (
    <section className="cmp-ranking">
      <div className="cmp-editorial-head">
        <div>
          <h2>Hva bruker kommunene?</h2>
          <p>{title} · per innbygger (totalbeløp)</p>
        </div>
        <span>{year}</span>
      </div>
      <div className="cmp-rankings">
        {rows.map((row) => (
          <div key={row.code} className={`cmp-ranking-row ${row.code === target.entity.code ? "own" : ""}`}>
            <button type="button" className="cmp-rank-trigger" aria-haspopup="dialog"
              aria-label={`${row.own.name}: ${moneyPerPerson(row.a)} per innbygger. Åpne historikk.`}
              onClick={() => onOpen(row.detail)}>
              <span className="cmp-rank-heading">
                <span>{row.own.name}</span>
                <span>
                  {moneyPerPerson(row.a)} <small>({nominal(row.own.amount)})</small>
                </span>
              </span>
              <span className="cmp-rank-track">
                <span style={{ width: `${Math.abs(row.a ?? 0) / maximum * 100}%` }} />
              </span>
            </button>
            <div className="cmp-rank-hover"><CostTable row={row} context={title} /></div>
          </div>
        ))}
      </div>
      <p className="cmp-footnote">
        Manglende verdier vises som «–». Referansen utelater {entityName(target)}.
        {hasNegative && " Stolpelengden viser beløpets størrelse."}
      </p>
    </section>
  );
}

export default function ComparisonWorkspace({
  target,
  peers,
  entities,
  year,
  years,
  sector,
  onSector,
  method,
  onMethod,
  functionCode,
  onFunction,
}) {
  const [path, setPath] = useState(EMPTY_PATH);
  const [popup, setPopup] = useState(null);
  const sectorName = SECTORS.find(([code]) => code === sector)?.[1];
  const functions = (target.functions || []).filter((fn) => fn.serviceCodes?.includes(sector));
  const selectedFunction = functions.find((fn) => fn.code === functionCode);
  const fn = selectedFunction?.code || "";
  const scope = `${sector}/${fn}`;
  const purchaseDrill = path.scope === scope && path.post === OWN_PURCHASES;
  const { purchaseArts, pending, error, retry } = usePurchaseArts(purchaseDrill ? fn : "");
  const benchmarkPeers = peers.map((peer) => withPurchaseArts(peer, purchaseArts));
  const read = (detail, service = sector, func = fn, art = "") =>
    comparisonRow(withPurchaseArts(detail, purchaseArts), benchmarkPeers, year, service, func, method, null, "perCapita", art);
  const posts = fn ? ACCOUNT_SECTIONS.flatMap(([, entries]) => entries.map(([code, name, children]) => ({
    ...read(target, sector, fn, code),
    code,
    label: POST_LABELS[code],
    context: name,
    children: children ?? [],
  }))).filter((row) => Number.isFinite(row.own.amount) || Number.isFinite(row.b)) : [];
  const post = path.scope === scope ? posts.find((row) => row.code === path.post) : null;
  const reportedArts = (codes) => codes.map((code) => {
    const source = [target, ...peers]
      .map((detail) => accountingObservation(detail, year, fn, code))
      .find((point) => point.name);
    return {
      ...read(target, sector, fn, code),
      code,
      label: source?.name || post.context,
      axisCode: code === PURCHASE_REMAINDER ? undefined : code,
      context: code === PURCHASE_REMAINDER ? source?.name : `${code} · ${source?.name || post.context}`,
    };
  }).filter((row) => Number.isFinite(row.own.amount) || Number.isFinite(row.b));
  const children = post ? reportedArts(post.children) : [];
  const arts = post && !children.length && !purchaseDrill ? reportedArts([post.code]) : children;
  const art = arts.find((row) => row.code === path.art);
  const account = art || post;
  const title = account?.context || selectedFunction?.name || sectorName || "Samlet netto drift";
  const breadcrumbs = [
    "Tjenesteområder",
    sectorName,
    selectedFunction && `${fn} · ${selectedFunction.name}`,
    post?.label,
    art && (art.axisCode || art.label),
  ].filter(Boolean);
  const level = post ? "Artskontoer" : fn ? "Regnskapsposter" : sectorName ? "KOSTRA-funksjoner" : "Tjenesteområder";
  const rows = post ? arts : fn ? posts : sectorName
    ? functions.map(({ code, name }) => ({
        ...read(target, sector, code), code, label: name, axisCode: code, context: `${code} · ${name}`,
      }))
    : SECTORS.map(([code, name]) => ({
        ...read(target, code, ""), code, label: SERVICE_LABELS[code] || name, context: name,
      }));

  const gross = fn && !post ? accountingArtBreakdown(target, year, fn).reconciliation : null;
  const summary = read(target, sector, fn, account?.code);
  const ranks = [target, ...peers].map((detail) => ({
    ...read(detail, sector, fn, account?.code),
    code: detail.entity.code,
    detail,
  })).sort((a, b) =>
    (b.a ?? -Infinity) - (a.a ?? -Infinity) || a.own.name.localeCompare(b.own.name, "nb"),
  );

  function selectRow(code) {
    if (post) {
      setPath({ scope, post: post.code, art: code });
    } else if (fn) {
      setPath({ scope, post: code, art: "" });
    } else if (sectorName) {
      onFunction(code);
      setPath(EMPTY_PATH);
    } else {
      onSector(code);
      onFunction("");
      setPath(EMPTY_PATH);
    }
  }

  function returnTo(step) {
    if (step === breadcrumbs.length - 1) return;
    if (step === 0) onSector("");
    if (step < 2) onFunction("");
    setPath(step === 3 ? { scope, post: post.code, art: "" } : EMPTY_PATH);
  }

  return (
    <div className="cmp-workspace">
      <section className="cmp-service-overview" aria-labelledby="cmp-services-title">
        <div className="cmp-editorial-head">
          <div>
            <h2 id="cmp-services-title">{level}</h2>
            <p>{post ? "Velg en art for å se nøkkeltall." : "Velg en søylegruppe for å gå videre."}</p>
          </div>
          <div className="cmp-chart-legend">
            <span><i />{entityName(target)}</span>
            <span><i className="peer" />{referenceName(method)} · {peers.length} kommuner</span>
          </div>
        </div>
        <div className="cmp-drill-controls">
          <nav className="cmp-drill-path" aria-label="Sti i grafen">
            {breadcrumbs.map((name, step) => (
              <React.Fragment key={step}>
                {step > 0 && <span aria-hidden="true">›</span>}
                <button type="button" aria-current={step === breadcrumbs.length - 1 ? "step" : undefined}
                  title={name} onClick={() => returnTo(step)}>
                  {name}
                </button>
              </React.Fragment>
            ))}
          </nav>
          <select aria-label={`Velg fra ${level.toLowerCase()}`} value={art?.code || ""} disabled={!rows.length}
            onChange={(event) => event.target.value && selectRow(event.target.value)}>
            <option value="">{post ? "Velg art" : fn ? "Velg regnskapspost" : sectorName ? "Velg funksjon" : "Velg tjenesteområde"}</option>
            {rows.map((row) => <option key={row.code} value={row.code}>{row.context}</option>)}
          </select>
        </div>
        {rows.length ? (
          <CostChart
            rows={rows}
            paired
            deltas
            selected={art?.code}
            animate={false}
            title={level}
            categoryLabel={level}
            wrapCategories
            onSelect={selectRow}
            chartKey={[target.entity.code, year, method, sector, fn, post?.code, ...peers.map((peer) => peer.entity.code)].join("-")}
          />
        ) : purchaseDrill && (pending || error) ? (
          <p className="cmp-drill-empty" role={error ? "alert" : "status"}>
            {error ? "Kunne ikke hente artsfordelingen fra SSB. " : "Henter artsfordelingen fra SSB…"}
            {error && <button type="button" onClick={retry}>Prøv igjen</button>}
          </p>
        ) : (
          <p className="cmp-drill-empty">Ingen rapporterte {level.toLowerCase()} for dette valget og året.</p>
        )}
        <p className="cmp-footnote cmp-drill-note">
          {purchaseDrill
            ? PURCHASE_BREAKDOWN_NOTE
            : post?.code === "AG16" && children.length
              ? "Pensjon og arbeidsgiveravgift inngår i lønnsposten. Sykelønnsrefusjon er allerede trukket fra."
              : post
              ? "Dette er det mest detaljerte nivået i KOSTRA-uttrekket for posten. Artsgrupper vises der enkeltarter mangler."
              : fn && (
                <>
                  Brutto utgifter og rapporterte inntekter vises som egne poster.
                  {Number.isFinite(gross.functionTotal) && ` Rapportert bruttototal for ${entityName(target)} er ${nominal(gross.functionTotal)}.`}
                  {gross.status === "difference" && ` Utgiftspostene avviker fra bruttototalen med ${n(Math.abs(gross.difference) * 1000)} kr.`}
                </>
              )}
        </p>
      </section>
      <div className="cmp-detail-layout">
        <ComparisonFacts title={title} summary={summary} method={method} year={year} onMethod={onMethod} account={account} />
        <MunicipalityRanking rows={ranks} target={target} year={year} title={title} onOpen={setPopup} />
      </div>
      <details className="cmp-workspace-method">
        <summary>Tallgrunnlag og metode</summary>
        <p>
          SSB / KOSTRA · kommunekonsern. Samlet netto drift hentes direkte fra regnskapet.
          Tjenesteområder kan overlappe og summeres ikke. Regnskapsposter og arter følger
          det rapporterte uttrekket for samme funksjon og år. Underarter kan inngå i en
          artsgruppe og summeres ikke på nytt. Referansen beregnes per innbygger og
          utelater valgt kommune. Vektet snitt er rapporterte beløp delt på beregnet
          folketall. Folketall rekonstrueres fra driftsinntekter totalt og per innbygger.
          Beløpene er i løpende kroner. År/år-endring bruker foregående kalenderår.
        </p>
      </details>
      {popup && (
        <ComparisonDialog
          target={popup}
          peers={[target, ...peers].filter((detail) => detail.entity.code !== popup.entity.code)}
          entities={entities}
          year={year}
          years={years}
          sector={sector}
          fn={fn}
          account={account ? { code: account.code, label: account.context } : undefined}
          method={method}
          onClose={() => setPopup(null)}
        />
      )}
    </div>
  );
}
