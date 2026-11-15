import React, { useEffect, useMemo, useRef, useState } from "react";
import { loadKostraIndex, loadKostraDetail } from "../lib/kostra";
import { displayEntityName } from "../kostra/model";
import { sortExplorerRows } from "../kostra/explorer";
import {
  SECTORS,
  COMPARISON_ROUTE,
  readComparisonRoute,
  defaultPeers,
  point,
  comparison,
} from "./comparison";
import "./comparison.css";
import ComparisonWorkspace from "./ComparisonWorkspace";
import OccupationComparison from "./OccupationComparison";
import SvenMeasures, { useSvenInputs } from "./SvenMeasures";
import ComparisonDialog from "./ComparisonDialog";

const number = (n, digits = 0) =>
  Number.isFinite(n)
    ? new Intl.NumberFormat("nb-NO", { maximumFractionDigits: digits }).format(
        n,
      )
    : "–";
const TABS = [
  ["compare", "Sammenlign"],
  ["explain", "Forklar forskjellene"],
  ["sven", "Svens forslag"],
];
function download(filename, value, type) {
  const url = URL.createObjectURL(new Blob(["\uFEFF", value], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const csv = (rows) =>
  rows
    .map((row) =>
      row
        .map((value) => `"${String(value ?? "").replaceAll('"', '""')}"`)
        .join(";"),
    )
    .join("\r\n");
function Sven({ children, small = false }) {
  return (
    <div className={`cmp-sven ${small ? "cmp-sven--small" : ""}`}>
      <img src="/bilder/sven-ai-analytiker.webp" alt="" />
      <div>
        <div className="cmp-eyebrow">Sven · din kommuneanalytiker</div>
        {children}
      </div>
    </div>
  );
}

export default function MunicipalityComparison({ hash }) {
  const route = useRef(readComparisonRoute(hash)).current;
  const [index, setIndex] = useState(null),
    [indexError, setIndexError] = useState("");
  const [code, setCode] = useState(route.code),
    [year, setYear] = useState(route.year);
  const [peerCodes, setPeerCodes] = useState(route.peers);
  const [dataset, setDataset] = useState(null);
  const [failedRequest, setFailedRequest] = useState(null);
  const [attempt, setAttempt] = useState(0);
  const [sector, setSector] = useState(""),
    [functionCode, setFunctionCode] = useState("");
  const [functionSort, setFunctionSort] = useState({ key: "code", direction: "asc" });
  const [explainedFunction, setExplainedFunction] = useState("");
  const [tab, setTab] = useState("compare"),
    [method, setMethod] = useState("median");
  const [waitingForSven, setWaitingForSven] = useState(false);
  const [editingPeers, setEditingPeers] = useState(false),
    [search, setSearch] = useState(""),
    [message, setMessage] = useState("");
  useEffect(() => {
    let active = true;
    loadKostraIndex()
      .then((data) => {
        if (!active) return;
        if (!data)
          throw new Error("Kommunedata er ikke tilgjengelige akkurat nå.");
        setIndex(data);
        setYear((y) => (data.years.includes(y) ? y : data.latestYear));
        const valid = data.entities.some(
          (e) =>
            e.kind === "municipality" &&
            e.code === route.code &&
            e.code !== "0301",
        )
          ? route.code
          : "1103";
        setCode(valid);
        setPeerCodes((old) =>
          old
            ? [...new Set(old)].filter(
                (c) =>
                  c !== valid &&
                  c !== "0301" &&
                  data.entities.some(
                    (e) => e.kind === "municipality" && e.code === c,
                  ),
              )
            : defaultPeers(data.entities, valid),
        );
      })
      .catch((e) => {
        if (active) {
          setIndexError(e.message);
        }
      });
    return () => {
      active = false;
    };
  }, [route]);
  const entities = useMemo(
    () =>
      (index?.entities || [])
        .filter((e) => e.kind === "municipality" && e.code !== "0301")
        .sort((a, b) => a.name.localeCompare(b.name, "nb")),
    [index],
  );
  const selectedPeers = useMemo(
    () => (peerCodes || []).filter((c) => c !== code),
    [peerCodes, code],
  );
  const selection = [code, ...selectedPeers].join(",");
  const target = dataset?.details[dataset.code];
  const peers = dataset?.peerCodes.map((c) => dataset.details[c]).filter(Boolean) ?? [];
  const requestFailed = failedRequest?.selection === selection && failedRequest.attempt === attempt;
  const loading = !requestFailed && (dataset?.selection !== selection || dataset.attempt !== attempt);
  const sven = useSvenInputs(year, Boolean(target));
  const busy = loading || waitingForSven || (tab === "sven" && !sven.ready);
  useEffect(() => {
    if (waitingForSven && sven.ready) {
      setTab("sven");
      setWaitingForSven(false);
    }
  }, [waitingForSven, sven.ready]);
  const selectTab = (next) => {
    const wait = next === "sven" && !sven.ready;
    setWaitingForSven(wait);
    if (!wait) setTab(next);
  };
  useEffect(() => {
    if (!index || !peerCodes) return;
    let active = true;
    const codes = [code, ...selectedPeers];
    Promise.allSettled(codes.map((c) => loadKostraDetail("municipality", c))).then((results) => {
      if (!active) return;
      const next = {},
        failed = [];
      results.forEach((r, i) => {
        const c = codes[i];
        if (r.status === "fulfilled" && r.value) next[c] = r.value;
        else failed.push(c);
      });
      if (!next[code]) {
        setFailedRequest({ selection, attempt });
        return;
      }
      setFailedRequest(null);
      setFunctionCode((fn) => next[code].functions?.some((entry) => entry.code === fn) ? fn : "");
      setDataset({ code, peerCodes: selectedPeers, selection, attempt, details: next, missing: failed });
    });
    return () => {
      active = false;
    };
  }, [index, code, peerCodes, selectedPeers, selection, attempt]);
  useEffect(() => {
    if (!index || !year || !peerCodes) return;
    const q = new URLSearchParams({
      kommune: code,
      aar: String(year),
      mot: selectedPeers.join(","),
    });
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}${window.location.search}${COMPARISON_ROUTE}?${q}`,
    );
  }, [index, code, year, peerCodes, selectedPeers]);
  const visiblePeers = dataset?.peerCodes ?? selectedPeers;
  const missing = dataset?.missing ?? [];
  const entity = target?.entity ?? entities.find((e) => e.code === code);
  const ownName = displayEntityName(entity);
  const functions = (target?.functions || []).filter(
    (f) => sector && f.serviceCodes?.includes(sector),
  );
  const functionRows = tab === "explain" && target
    ? (sector ? functions : target.functions || []).map((f) => {
        const result = comparison(target, peers, year, "", f.code, method);
        return {
          ...f,
          perCapita: result.own?.perCapita,
          reference: result.reference.value,
          percent: result.percent,
          count: result.reference.count,
        };
      })
    : [];
  const ascending = functionSort.direction === "asc";
  const sortedFunctionRows = functionSort.key === "code"
    ? functionRows.sort((a, b) =>
        a.code.localeCompare(b.code, "nb", { numeric: true }) * (ascending ? 1 : -1),
      )
    : sortExplorerRows(functionRows, functionSort.key, functionSort.direction);
  const sortFunctions = (key) => setFunctionSort((current) => ({
    key,
    direction: current.key === key
      ? (current.direction === "asc" ? "desc" : "asc")
      : (key === "code" ? "asc" : "desc"),
  }));
  const title = functionCode
    ? functions.find((f) => f.code === functionCode)?.name
    : sector
      ? SECTORS.find((s) => s[0] === sector)?.[1]
      : "Samlet netto drift";
  const rows = [target, ...peers].filter(Boolean).map((d) => ({
    detail: d,
    ...point(d, year, sector, functionCode),
    name: displayEntityName(d.entity),
  }));
  const selectMunicipality = (next) => {
    setCode(next);
    setPeerCodes(defaultPeers(index.entities, next));
    setMessage("");
  };
  const exportData = () =>
    download(
      `kommunesammenligning-${code}-${year}.csv`,
      csv([
        [
          "Kommune",
          "År",
          "Område",
          "Netto driftsutgifter (1000 kr)",
          "Kr per innbygger",
          "Kilde",
        ],
        ...rows.map((r) => [
          r.name,
          year,
          title,
          r.amount,
          r.perCapita,
          "SSB KOSTRA 12362 / 12367; kommunekonsern",
        ]),
        [
          "Referansemetode",
          method === "median" ? "Median" : "Befolkningsvektet snitt",
        ],
        [
          "Forbehold",
          "Ikke behovskorrigert. Kostnadsavvik er ikke dokumentert innsparing.",
        ],
      ]),
      "text/csv;charset=utf-8",
    );
  const share = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setMessage("Lenken deler kommune, år og kommuneutvalg.");
    } catch {
      setMessage(
        "Kopier adressen fra nettleseren for å dele visningen.",
      );
    }
  };
  if (indexError)
    return (
      <section className="cmp-page">
        <h1>Kunne ikke laste sammenligningen</h1>
        <p role="alert">{indexError}</p>
        <button onClick={() => window.location.reload()}>Prøv igjen</button>
      </section>
    );
  return (
    <section className="cmp-page" aria-label="Sammenlign kommuner">
      <div className="cmp-topline">
        <a href="#kommuner">← Kommuner og fylker</a>
      </div>
      <header className="cmp-header">
        <div className="cmp-eyebrow">Kommuneanalyse</div>
        <h1>
          Sammenlign kommuner<span>.</span>
        </h1>
        <p>
          Se forskjellene. Still bedre spørsmål.
          <br />
          Finn rom for nye prioriteringer – sammen med Sven.
        </p>
      </header>
      <div className="cmp-toolbar">
        <label>
          Din kommune
          <select
            value={code}
            onChange={(e) => selectMunicipality(e.target.value)}
            disabled={!index}
          >
            {!index && <option>Laster…</option>}
            {entities.map((e) => (
              <option key={e.code} value={e.code}>
                {displayEntityName(e)}
              </option>
            ))}
          </select>
        </label>
        <label>
          År
          <select
            value={year || ""}
            onChange={(event) => setYear(Number(event.target.value))}
            disabled={!index}
          >
            <optgroup label="Regnskap">
              {[...(index?.years || [])].reverse().map((y) => <option key={y} value={y}>{y}</option>)}
            </optgroup>
          </select>
        </label>

        <button
          className="cmp-peer-button"
          onClick={() => setEditingPeers(!editingPeers)}
          aria-expanded={editingPeers}
        >
          Sammenlign med <strong>{selectedPeers.length} kommuner</strong>
          <span>Tilpass utvalget ↗</span>
        </button>

        <div className="cmp-tools">
          <button onClick={share} disabled={loading || requestFailed || !target}>Del analyse ↗</button>
          <button onClick={exportData} disabled={loading || requestFailed || !target}>
            Eksporter CSV ↓
          </button>
        </div>
      </div>
      {editingPeers && (
        <div className="cmp-peer-editor">
          <div className="cmp-panel-head">
            <div>
              <h2>Velg sammenligningskommuner</h2>
              <p>
                Forslaget følger kommunens nåværende KOSTRA-gruppe. Det er et
                utgangspunkt, ikke en behovskorrigering.
              </p>
            </div>
            <button onClick={() => setEditingPeers(false)}>Ferdig</button>
          </div>
          <div className="cmp-peer-actions">
            <input
              type="search"
              aria-label="Søk etter kommune"
              placeholder="Søk etter kommune…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <button
              onClick={() => setPeerCodes(defaultPeers(index.entities, code))}
            >
              Bruk KOSTRA-gruppen
            </button>
            <button onClick={() => setPeerCodes([])}>Tøm utvalget</button>
          </div>
          <p className="cmp-muted">
            Inntil 12 kommuner. Oslo er utelatt fordi regnskapet også omfatter
            fylkeskommunale oppgaver.
          </p>
          <div className="cmp-peer-grid">
            {entities
              .filter(
                (e) =>
                  e.code !== code &&
                  (search
                    ? e.name
                        .toLocaleLowerCase("nb")
                        .includes(search.toLocaleLowerCase("nb"))
                    : selectedPeers.includes(e.code)),
              )
              .map((e) => (
                <label key={e.code}>
                  <input
                    type="checkbox"
                    checked={selectedPeers.includes(e.code)}
                    disabled={
                      !selectedPeers.includes(e.code) &&
                      selectedPeers.length >= 12
                    }
                    onChange={(event) =>
                      setPeerCodes((old) =>
                        event.target.checked
                          ? [...old, e.code]
                          : old.filter((c) => c !== e.code),
                      )
                    }
                  />
                  {displayEntityName(e)}
                </label>
              ))}
          </div>
        </div>
      )}

      <div className="cmp-peer-strip">
        <span>Utvalg</span>
        {visiblePeers.map((c) => (
          <span key={c}>
            {displayEntityName(entities.find((e) => e.code === c))}
          </span>
        ))}
        {!visiblePeers.length && (
          <span>Velg kommuner for å beregne en referanse.</span>
        )}
      </div>

      {message && (
        <div className="cmp-message" role="status">
          {message}
          <button aria-label="Lukk melding" onClick={() => setMessage("")}>
            ×
          </button>
        </div>
      )}
      {requestFailed && (
        <p className="cmp-warning" role="alert">
          Regnskapet for {displayEntityName(entities.find((e) => e.code === code))} kunne ikke lastes.
          {target && ` Viser fortsatt ${ownName}.`}{" "}
          <button type="button" onClick={() => setAttempt((n) => n + 1)}>Prøv igjen</button>
        </p>
      )}
      {!requestFailed && missing.length > 0 && (
        <p className="cmp-warning" role="alert">
          Data kunne ikke lastes for{" "}
          {missing
            .map((c) => displayEntityName(entities.find((e) => e.code === c)))
            .join(", ")}
          . Disse er utelatt fra beregningen.
        </p>
      )}
      <nav className={`cmp-tabs ${busy ? "cmp-tabs--busy" : ""}`} aria-label="Analysevisning">
        {TABS.map(([id, label]) => (
          <button
            key={id}
            aria-current={tab === id ? "page" : undefined}
            className={tab === id ? "active" : ""}
            onClick={() => selectTab(id)}
          >
            {label}
          </button>
        ))}
      </nav>
      <span className="ft-skjult" role="status">{busy ? "Oppdaterer analysen…" : ""}</span>
      <div aria-busy={busy}>
      {!target && loading ? (
        <div className="cmp-loading" role="status">
          Henter kommuneregnskapene…
        </div>
      ) : target && (
        <>
          {tab === "explain" && (
            <div className="cmp-filters">
              <label>
                Tjenesteområde
                <select
                  value={sector}
                  onChange={(e) => {
                    setSector(e.target.value);
                    setFunctionCode("");
                  }}
                >
                  <option value="">Samlet netto drift</option>
                  {SECTORS.map(([c, n]) => (
                    <option key={c} value={c}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Detaljnivå
                <select
                  value={functionCode}
                  onChange={(e) => setFunctionCode(e.target.value)}
                  disabled={!sector}
                >
                  <option value="">Hele området</option>
                  {functions.map((f) => (
                    <option key={f.code} value={f.code}>
                      {f.code} · {f.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Referanse
                <select
                  value={method}
                  onChange={(e) => setMethod(e.target.value)}
                >
                  <option value="median">Median i utvalget</option>
                  <option value="weighted">Befolkningsvektet snitt</option>
                </select>
              </label>
            </div>
          )}
          {tab === "sven" && (
            <div className="cmp-filters">
              <label>
                Referanse for Svens forslag
                <select
                  value={method}
                  onChange={(e) => setMethod(e.target.value)}
                >
                  <option value="median">Median i utvalget</option>
                  <option value="weighted">Befolkningsvektet snitt</option>
                </select>
              </label>
            </div>
          )}
          {tab === "compare" && (
            <>
              <ComparisonWorkspace
                target={target}
                peers={peers}
                entities={entities}
                year={year}
                years={index.years}
                sector={sector}
                onSector={setSector}
                method={method}
                onMethod={setMethod}
                functionCode={functionCode}
                onFunction={setFunctionCode}
              />
            </>
          )}
          {tab === "explain" && (
            <>
              <div className="cmp-section-title">
                <h2>Hva ligger bak forskjellen?</h2>
                <span>
                  {sector
                    ? SECTORS.find((s) => s[0] === sector)?.[1]
                    : "Alle tjenesteområder"}{" "}
                  · {year}
                </span>
              </div>
              <Sven small>
                <p>
                  Jeg skiller mellom <strong>det vi kan måle</strong> og{" "}
                  <strong>det vi må undersøke</strong>. Her er regnskapet brutt
                  ned i funksjoner. Klikk på en rad for å analysere funksjonen
                  videre.
                </p>
              </Sven>
              <div className="cmp-table-wrap">
                <table>
                  <caption>
                    Funksjoner i{" "}
                    {sector
                      ? SECTORS.find((s) => s[0] === sector)?.[1]
                      : "alle tjenesteområder"}
                    . Avvik beregnet per innbygger.
                  </caption>
                  <thead>
                    <tr>
                      {[
                        ["code", "Funksjon"],
                        ["perCapita", `${ownName}, kr/innb.`],
                        ["reference", "Referanse, kr/innb."],
                        ["percent", "Avvik"],
                      ].map(([key, label]) => {
                        const active = functionSort.key === key;
                        return (
                          <th
                            key={key}
                            scope="col"
                            className="cmp-sort-heading"
                            aria-sort={active ? (ascending ? "ascending" : "descending") : undefined}
                          >
                            <button type="button" onClick={() => sortFunctions(key)}>
                              <span>{label}</span>
                              <span aria-hidden="true">{active ? (ascending ? "↑" : "↓") : "↕"}</span>
                            </button>
                          </th>
                        );
                      })}
                      <th scope="col">Kommuner med data</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedFunctionRows.map((f) => (
                      <tr
                        key={f.code}
                        className="cmp-explain-row"
                        onClick={(event) => {
                          event.currentTarget.querySelector("button").focus({ preventScroll: true });
                          setExplainedFunction(f.code);
                        }}
                      >
                        <th scope="row">
                          <button type="button" aria-haspopup="dialog">
                            {f.code} · {f.name} ↗
                          </button>
                        </th>
                        <td>{number(f.perCapita)}</td>
                        <td>{number(f.reference)}</td>
                        <td className={f.percent > 0 ? "cmp-rust" : ""}>
                          {f.percent > 0 ? "+" : ""}
                          {number(f.percent, 1)} %
                        </td>
                        <td>
                          {f.count}/{visiblePeers.length}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {explainedFunction && (
                <ComparisonDialog
                  target={target}
                  peers={peers}
                  entities={entities}
                  year={year}
                  years={index.years}
                  fn={explainedFunction}
                  method={method}
                  initialView="drivers"
                  onClose={() => setExplainedFunction("")}
                />
              )}
              <OccupationComparison target={target} peers={peers} year={year} years={index.years} />
            </>
          )}
          {tab === "sven" && (
            <>
              <div className="cmp-section-title">
                <h2>Hvor kan kommunen spare?</h2>
                <span>{ownName} · {sven.year}</span>
              </div>
              <Sven small>
                <p><strong>Jeg har for lite informasjon til å gi informerte spareanslag.</strong>{" "}
                  Regneeksemplene viser hvor det kan være verdt å lete. Jeg mangler lokale avtaler,
                  lønnskostnader og informasjon om tjenestekvalitet og arbeidsbelastning.
                  Vurder konsekvensene for innbyggerne og ansatte i tjenestene før dere går videre.
                </p>
              </Sven>
              <SvenMeasures target={target} peers={peers} year={sven.year} method={method} data={sven} />
            </>
          )}
        </>
      )}
      </div>

      <details className="cmp-method">
        <summary>Datagrunnlag, metode og begrensninger</summary>
        <div>
          <p>
            <strong>Kilde:</strong> SSB KOSTRA, kommunekonsern. Sektorer: tabell
            12362. Funksjoner: tabell 12367. Samlet netto drift: tabell 12137.
            Siste tilgjengelige regnskapsår i dette uttrekket:{" "}
            {index?.latestYear || "–"}. Uttrekk oppdatert{" "}
            {index?.updated
              ? new Date(index.updated).toLocaleDateString("nb-NO")
              : "–"}
            .
          </p>
          <p>
            <strong>Beregning:</strong> Referansen utelater din kommune og
            kommuner uten data. Medianen er midterste verdi (gjennomsnitt av de
            to midterste ved partall). Vektet snitt er samlede utgifter delt på
            samlet, rekonstruert befolkning. Befolkning er beregnet fra
            driftsinntekter totalt og per innbygger og kan avvike litt som følge
            av avrunding. Kostnadsavvik i kroner er forskjellen per innbygger
            multiplisert med din kommunes beregnede befolkning.
          </p>
          <p>
            <strong>Avgrensning:</strong> Tallene er ikke behovs- eller
            prisjustert. Resultater kan påvirkes av organisering, føring,
            avskrivninger, endrede kommunegrenser og ulik kvalitet. Svens observasjoner kommer fra åpne, faste
            beregningsregler, ikke en språkmodell.
          </p>
          <div className="cmp-source-links">
            <a
              href="https://www.ssb.no/statbank/table/12362/"
              target="_blank"
              rel="noreferrer"
            >
              SSB 12362 ↗
            </a>
            <a
              href="https://www.ssb.no/statbank/table/12367/"
              target="_blank"
              rel="noreferrer"
            >
              SSB 12367 ↗
            </a>
            <a
              href="https://www.ssb.no/statbank/table/12137/"
              target="_blank"
              rel="noreferrer"
            >
              SSB 12137 ↗
            </a>
          </div>
        </div>
      </details>

      <footer className="cmp-footer">
        <span>Fellestall Pluss</span>
        <span>Et bedre grunnlag for lokale beslutninger.</span>
      </footer>
    </section>
  );
}
