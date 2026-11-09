import React, { useCallback, useState } from "react";
import { SECTORS, population } from "./comparison";
import CostChart, { CostTable } from "./CostChart";
import ComparisonDialog from "./ComparisonDialog";
import AccountingDrill from "./AccountingDrill";
import {
  comparisonRow,
  entityName,
  formatNumber as n,
  nominal,
  percent,
  referenceName,
} from "./workspace-model";
import "./workspace.css";

const LABELS = {
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
  initialFunction = "",
  onFunction,
}) {
  const [detailView, setDetailView] = useState("functions");
  const [popup, setPopup] = useState(
    initialFunction
      ? { detail: target, fn: initialFunction, initialView: "peers" }
      : null,
  );
  const close = useCallback(() => {
    setPopup(null);
    onFunction("");
  }, [onFunction]);
  const functions = (target.functions || []).filter(
    (f) => sector && f.serviceCodes?.includes(sector),
  );
  const summary = comparisonRow(target, peers, year, sector, "", method);
  const sectors = SECTORS.map(([code, name]) => ({
    ...comparisonRow(target, peers, year, code, "", method),
    code,
    label: LABELS[code],
    context: name,
  }));
  const functionRows = functions.map((f) => ({
    ...comparisonRow(target, peers, year, sector, f.code, method),
    code: f.code,
    label: f.code,
    context: `${f.code} · ${f.name}`,
  }));
  const ranks = [target, ...peers]
    .map((detail) => ({
      ...comparisonRow(detail, peers, year, sector, "", method),
      code: detail.entity.code,
      detail,
    }))
    .sort(
      (a, b) =>
        (b.a ?? -Infinity) - (a.a ?? -Infinity) ||
        a.own.name.localeCompare(b.own.name, "nb"),
    );
  const maximum = Math.max(1, ...ranks.map((r) => r.a || 0));
  const title =
    SECTORS.find((s) => s[0] === sector)?.[1] || "Samlet netto drift";
  const selectSector = (value) => {
    setPopup(null);
    onSector(value === sector ? "" : value);
    onFunction("");
  };
  const inspectFunction = (code) => {
    onFunction(code);
    setPopup({ detail: target, fn: code, initialView: "peers" });
  };
  const chartKey = `${target.entity.code}-${year}-${method}-${peers.map((d) => d.entity.code).join(",")}`;
  return (
    <div className="cmp-workspace">
      <section
        className="cmp-service-overview"
        aria-labelledby="cmp-services-title"
      >
        <div className="cmp-editorial-head">
          <div>
            <h2 id="cmp-services-title">Tjenesteområder</h2>
            <p>Velg et område for å sammenligne kommunene.</p>
          </div>
          <div className="cmp-chart-legend">
            <span>
              <i />
              {entityName(target)}
            </span>
            <span>
              <i className="peer" />
              {referenceName(method)} · {peers.length} kommuner
            </span>
          </div>
        </div>
        <CostChart
          rows={sectors}
          paired
          deltas
          selected={sector}
          animate={false}
          title="Tjenesteområder"
          onSelect={selectSector}
          chartKey={`services-${chartKey}`}
        />
        <label className="cmp-mobile-sector">
          Tjenesteområde
          <select value={sector} onChange={(e) => selectSector(e.target.value)}>
            <option value="">Alle tjenesteområder</option>
            {SECTORS.map(([c, name]) => (
              <option key={c} value={c}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <div className="cmp-chart-keyboard" aria-label="Velg tjenesteområde">
          {SECTORS.map(([c, name]) => (
            <button
              key={c}
              aria-pressed={sector === c}
              onClick={() => selectSector(c)}
            >
              {name}
            </button>
          ))}
        </div>
        <div className="cmp-selected-facts" aria-live="polite">
          <div className="cmp-facts-head">
            <div>
              <h3>{title}</h3>
              <span>
                {entityName(target)} · {year}
              </span>
            </div>
            <button onClick={() => selectSector("")} disabled={!sector}>
              Alle tjenesteområder
            </button>
          </div>
          <dl className="cmp-facts-grid">
            <div>
              <dt>Per innbygger</dt>
              <dd>{n(summary.own.perCapita)} kr</dd>
            </div>
            <div>
              <dt>{referenceName(method)} · per innbygger</dt>
              <dd>{n(summary.reference.perCapita)} kr</dd>
            </div>
            <div>
              <dt>Avvik fra {referenceName(method).toLowerCase()}</dt>
              <dd>{percent(summary.percent)}</dd>
            </div>
            <div className="secondary">
              <dt>Totale netto driftsutgifter</dt>
              <dd>{nominal(summary.own.amount)}</dd>
            </div>
            <div className="secondary">
              <dt>Folketall</dt>
              <dd>
                {population(target, year) > 0
                  ? `≈ ${n(population(target, year))} innbyggere`
                  : "–"}
              </dd>
            </div>
            <div className="secondary">
              <dt>Referanse ved samme folketall</dt>
              <dd>{nominal(summary.reference.amount)}</dd>
            </div>
          </dl>
          <p>
            Referansebeløpet er beregnet ved {entityName(target)}s folketall.
            Referansen bygger på {summary.reference.count} kommuner med data.
          </p>
        </div>
      </section>
      <div className="cmp-workspace-meta">
        <span>
          {sector ? title : "Samlet netto drift"} · kommunekonsern · {year}
        </span>
        <label>
          Referanse
          <select value={method} onChange={(e) => onMethod(e.target.value)}>
            <option value="median">Median i utvalget</option>
            <option value="weighted">Befolkningsvektet snitt</option>
          </select>
        </label>
      </div>
      <div className={`cmp-detail-layout ${sector ? "has-sector" : ""}`}>
        <section className="cmp-ranking">
          <div className="cmp-editorial-head">
            <div>
              <h2>Hva bruker kommunene?</h2>
              <p>{title} · per innbygger (totalbeløp)</p>
            </div>
            <span>{year}</span>
          </div>
          <div className="cmp-rankings">
            {ranks.map((r) => (
              <div
                key={r.code}
                className={`cmp-ranking-row ${r.code === target.entity.code ? "own" : ""}`}
              >
                <button
                  className="cmp-rank-trigger"
                  aria-haspopup="dialog"
                  aria-label={`${r.own.name}: ${n(r.a)} kroner per innbygger. Åpne sammenligning.`}
                  onClick={() =>
                    setPopup({
                      detail: r.detail,
                      fn: "",
                      initialView: "history",
                    })
                  }
                >
                  <span className="cmp-rank-heading">
                    <span>{r.own.name}</span>
                    <span>
                      {n(r.a)} kr <small>({nominal(r.own.amount)})</small>
                    </span>
                  </span>
                  <span className="cmp-rank-track">
                    <span
                      style={{
                        width: `${Number.isFinite(r.a) ? (Math.max(0, r.a) / maximum) * 100 : 0}%`,
                      }}
                    />
                  </span>
                </button>
                <div className="cmp-rank-hover">
                  <CostTable row={r} context={title} />
                </div>
              </div>
            ))}
          </div>
          <p className="cmp-footnote">
            Manglende verdier vises som «–». Referansen utelater{" "}
            {entityName(target)}.
          </p>
        </section>
        <div className="cmp-function-slot" inert={!sector}>
          {sector && (
            <aside className="cmp-function-panel">
              <div className="cmp-editorial-head">
                <div>
                  <h2>Hva ligger bak?</h2>
                  <p>
                    {title} · {functions.length} KOSTRA-funksjoner
                  </p>
                </div>
              </div>
              <div className="cmp-view-switch cmp-account-switch" role="group" aria-label="Detaljnivå">
                <button type="button" aria-pressed={detailView === "functions"} onClick={() => setDetailView("functions")}>
                  Funksjoner
                </button>
                <button type="button" aria-pressed={detailView === "accounts"} onClick={() => setDetailView("accounts")}>
                  Regnskapsposter
                </button>
              </div>
              {detailView === "accounts" ? (
                <AccountingDrill target={target} peers={peers} year={year} method={method} functions={functions} />
              ) : (
                <>
                  <div className="cmp-function-labels" aria-label="Velg funksjon">
                    {functions.map((f) => (
                      <button
                        key={f.code}
                        aria-haspopup="dialog"
                        aria-pressed={popup?.fn === f.code}
                        onClick={() => inspectFunction(f.code)}
                      >
                        {f.code} · {f.name}
                      </button>
                    ))}
                  </div>
                  {functions.length ? (
                    <>
                      <div className="cmp-chart-legend">
                        <span>
                          <i />
                          {entityName(target)}
                        </span>
                        <span>
                          <i className="peer" />
                          {referenceName(method)}
                        </span>
                      </div>
                      <CostChart
                        rows={functionRows}
                        paired
                        deltas
                        animate={false}
                        title={title}
                        chartKey={`functions-${sector}-${chartKey}`}
                        onSelect={inspectFunction}
                      />
                    </>
                  ) : (
                    <p>Ingen funksjonsdata for dette området.</p>
                  )}
                </>
              )}
            </aside>
          )}
        </div>
      </div>
      <details className="cmp-workspace-method">
        <summary>Tallgrunnlag og metode</summary>
        <p>
          SSB / KOSTRA · kommunekonsern · netto driftsutgifter. Samlet netto
          drift hentes direkte fra regnskapet; tjenesteområder kan overlappe og
          summeres ikke. Referansen beregnes per innbygger og utelater valgt
          kommune. Vektet snitt er totale utgifter dividert på beregnet
          folketall. Folketall rekonstrueres fra driftsinntekter totalt og per
          innbygger. Kostnadsforskjeller er ikke dokumenterte innsparinger.
          Ingen pris- eller behovskorrigering. År/år-endring bruker foregående
          kalenderår i valgt måleenhet.
        </p>
      </details>
      {popup && (
        <ComparisonDialog
          key={`${popup.detail.entity.code}-${popup.fn}`}
          target={popup.detail}
          peers={[target, ...peers].filter(
            (d) => d.entity.code !== popup.detail.entity.code,
          )}
          entities={entities}
          year={year}
          years={years}
          sector={sector}
          fn={popup.fn}
          method={method}
          initialView={popup.initialView}
          onClose={close}
        />
      )}
    </div>
  );
}
