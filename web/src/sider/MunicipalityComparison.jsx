import React, { useEffect, useMemo, useRef, useState } from "react";
import { loadKostraIndex, loadKostraDetail } from "../lib/kostra";
import { formatKostraValue, displayEntityName } from "../kostra/model";
import { sortExplorerRows } from "../kostra/explorer";
import {
  SECTORS,
  COMPARISON_ROUTE,
  readComparisonRoute,
  defaultPeers,
  point,
  comparison,
  svenFindings,
  scenarioTotal,
  validateScenario,
} from "./comparison";
import "./comparison.css";
import ComparisonWorkspace from "./ComparisonWorkspace";
import ComparisonDialog from "./ComparisonDialog";
import BudgetWorkspace from "./BudgetWorkspace";

const number = (n, digits = 0) =>
  Number.isFinite(n)
    ? new Intl.NumberFormat("nb-NO", { maximumFractionDigits: digits }).format(
        n,
      )
    : "–";
const money = (n) => formatKostraValue(n, "amount");
const TABS = [
  ["compare", "Sammenlign"],
  ["publishedBudget", "Budsjett og regnskap"],
  ["explain", "Forklar forskjellene"],
  ["sven", "Svens forslag"],
  ["budget", "Mitt budsjettalternativ"],
];
const STORAGE = "fellestall-kommune-scenarios-v1";
function loadSaved() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE) || "{}");
    return saved && typeof saved === "object" && !Array.isArray(saved)
      ? saved
      : {};
  } catch {
    return {};
  }
}
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
  const [peerCodes, setPeerCodes] = useState(route.peers),
    [details, setDetails] = useState({});
  const [loading, setLoading] = useState(true),
    [missing, setMissing] = useState([]);
  const [sector, setSector] = useState(""),
    [functionCode, setFunctionCode] = useState("");
  const [functionSort, setFunctionSort] = useState({ key: "code", direction: "asc" });
  const [explainedFunction, setExplainedFunction] = useState("");
  const [tab, setTab] = useState(route.budgetView ? "publishedBudget" : "compare"),
    [method, setMethod] = useState("median");
  const [editingPeers, setEditingPeers] = useState(false),
    [search, setSearch] = useState(""),
    [message, setMessage] = useState("");
  const [saved, setSaved] = useState(loadSaved),
    [storageError, setStorageError] = useState("");
  const [newName, setNewName] = useState(""),
    [newAnnual, setNewAnnual] = useState("");
  const [budgetStart, setBudgetStart] = useState(2027);
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
          setLoading(false);
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
  useEffect(() => {
    if (!index || !peerCodes) return;
    let active = true;
    setLoading(true);
    setMissing([]);
    Promise.allSettled(
      [code, ...selectedPeers].map(async (c) => [
        c,
        await loadKostraDetail("municipality", c),
      ]),
    ).then((results) => {
      if (!active) return;
      const next = {},
        failed = [];
      results.forEach((r, i) => {
        const c = [code, ...selectedPeers][i];
        if (r.status === "fulfilled" && r.value[1]) next[c] = r.value[1];
        else failed.push(c);
      });
      setDetails(next);
      setMissing(failed);
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [index, code, peerCodes, selectedPeers]);
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE, JSON.stringify(saved));
      setStorageError("");
    } catch {
      setStorageError(
        "Nettleseren kunne ikke lagre. Eksporter tiltakene før du lukker siden.",
      );
    }
  }, [saved]);
  useEffect(() => {
    if (!index || !year || !peerCodes) return;
    const q = new URLSearchParams({
      kommune: code,
      aar: String(year),
      mot: selectedPeers.join(","),
    });
    if (tab === "publishedBudget") q.set("visning", "budsjett");
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}${window.location.search}${COMPARISON_ROUTE}?${q}`,
    );
  }, [index, code, year, peerCodes, selectedPeers, tab]);
  const publishedBudget = tab === "publishedBudget";
  const target = details[code];
  const peers = selectedPeers.map((c) => details[c]).filter(Boolean);
  const entity = entities.find((e) => e.code === code);
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
  const findings = loading ? [] : svenFindings(target, peers, year, method);
  const items = (Array.isArray(saved[code]) ? saved[code] : []).filter(
    validateScenario,
  );
  const setItems = (update) =>
    setSaved((previous) => ({
      ...previous,
      [code]:
        typeof update === "function"
          ? update(
              (Array.isArray(previous[code]) ? previous[code] : []).filter(
                validateScenario,
              ),
            )
          : update,
    }));
  const selectMunicipality = (next) => {
    setCode(next);
    setPeerCodes(defaultPeers(index.entities, next));
    setFunctionCode("");
    setMessage("");
  };
  const patchItem = (id, patch) =>
    setItems((old) => old.map((i) => (i.id === id ? { ...i, ...patch } : i)));
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
  const addCandidate = (finding) => {
    const id = `sector-${finding.code}`;
    if (items.some((i) => i.id === id)) {
      setTab("budget");
      setMessage(
        "Dette undersøkelsesområdet ligger allerede i budsjettalternativet.",
      );
      return;
    }
    setItems((old) => [
      ...old,
      {
        id,
        name: `Undersøk ${finding.name.toLocaleLowerCase("nb")}`,
        annual: 0,
        oneOff: 0,
        start: budgetStart,
        firstYearShare: 50,
        enabled: false,
        source: `Sven: kostnadsavvik ${money(finding.gapAmount)} mot ${method === "median" ? "medianen" : "vektet snitt"} i ${year}. Ikke behovskorrigert.`,
        note: "",
        risk: "Ikke vurdert",
      },
    ]);
    setTab("budget");
    setMessage(
      "Svens forslag er lagt til som et undersøkelsesområde. Beløp settes etter vurdering av konkrete tiltak.",
    );
  };
  const share = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setMessage(
        publishedBudget
          ? "Lenken til budsjettfanen er kopiert."
          : "Lenken er kopiert. Den deler kommune, år og kommuneutvalg. Dine tiltak blir ikke delt.",
      );
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
    <section className="cmp-page" aria-label="Sammenlign din kommune">
      <div className="cmp-topline">
        <a href="#kommuner">← Kommuner og fylker</a>
        <span className="cmp-premium">
          ◇ Felles­tall Pluss · Betalt tjeneste
        </span>
      </div>
      <header className="cmp-header">
        <div className="cmp-eyebrow">Sider / Kommuneanalyse</div>
        <h1>
          Sammenlign din kommune<span>.</span>
        </h1>
        <p>
          Se forskjellene. Still bedre spørsmål.
          <br />
          Finn rom for nye prioriteringer – sammen med Sven.
        </p>
      </header>
      <div className="cmp-preview">
        <span>FORHÅNDSVISNING</span> Du prøver arbeidsområdet for vår kommende
        betaltjeneste. Ingen betaling eller abonnement aktiveres her.
      </div>
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
        {!publishedBudget && (
          <label>
            Regnskapsår
            <select
              value={year || ""}
              onChange={(e) => setYear(+e.target.value)}
              disabled={!index}
            >
              {[...(index?.years || [])].reverse().map((y) => (
                <option key={y}>{y}</option>
              ))}
            </select>
          </label>
        )}
        {!publishedBudget && (
          <button
            className="cmp-peer-button"
            onClick={() => setEditingPeers(!editingPeers)}
            aria-expanded={editingPeers}
          >
            Sammenlign med <strong>{selectedPeers.length} kommuner</strong>
            <span>Tilpass utvalget ↗</span>
          </button>
        )}
        <div className="cmp-tools">
          <button onClick={share}>Del analyse ↗</button>
          {!publishedBudget && (
            <button onClick={exportData} disabled={loading || !target}>
              Eksporter CSV ↓
            </button>
          )}
        </div>
      </div>
      {!publishedBudget && editingPeers && (
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
      {!publishedBudget && (
        <div className="cmp-peer-strip">
          <span>Utvalg</span>
          {selectedPeers.map((c) => (
            <span key={c}>
              {displayEntityName(entities.find((e) => e.code === c))}
            </span>
          ))}
          {!selectedPeers.length && (
            <span>Velg kommuner for å beregne en referanse.</span>
          )}
        </div>
      )}
      {message && (
        <div className="cmp-message" role="status">
          {message}
          <button aria-label="Lukk melding" onClick={() => setMessage("")}>
            ×
          </button>
        </div>
      )}
      {!publishedBudget && missing.length > 0 && (
        <p className="cmp-warning" role="alert">
          Data kunne ikke lastes for{" "}
          {missing
            .map((c) => displayEntityName(entities.find((e) => e.code === c)))
            .join(", ")}
          . Disse er utelatt fra beregningen.
        </p>
      )}
      <nav className="cmp-tabs" aria-label="Analysevisning">
        {TABS.map(([id, label]) => (
          <button
            key={id}
            aria-current={tab === id ? "page" : undefined}
            className={tab === id ? "active" : ""}
            onClick={() => setTab(id)}
          >
            {label}
            {id === "budget" && items.length > 0 ? ` (${items.length})` : ""}
          </button>
        ))}
      </nav>
      {publishedBudget ? (
        <BudgetWorkspace
          code={code}
          name={ownName}
          onStavanger={() => index && selectMunicipality("1103")}
        />
      ) : loading ? (
        <div className="cmp-loading" role="status">
          Henter kommuneregnskapene…
        </div>
      ) : !target ? (
        <p role="alert">
          Kommuneregnskapet mangler. Velg en annen kommune eller last siden på
          nytt.
        </p>
      ) : (
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
            <ComparisonWorkspace
              key={`${code}-${year}`}
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
                          {f.count}/{selectedPeers.length}
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
              <div className="cmp-checks">
                {[
                  [
                    "Behov og befolkning",
                    "Alderssammensetning, levekår og pleietyngde kan forklare kostnadsforskjeller. Behovskorrigering er ikke koblet inn i denne versjonen.",
                  ],
                  [
                    "Tjenesteomfang og kvalitet",
                    "Åpne en funksjon for å se tilgjengelige SSB-tall om tjenesteomfang og bemanning. Kvalitet må også vurderes når kommunene sammenlignes.",
                  ],
                  [
                    "Bemanning og organisering",
                    "Årsverk, vikarbruk, sykefravær, skolestruktur og kjøpte tjenester må vurderes før avvik tolkes som overbemanning.",
                  ],
                  [
                    "Budsjett og gjennomføring",
                    "Tiltaket må kobles til riktig budsjettpost. Kontroller avtaler, lovkrav og innsparinger som allerede ligger i økonomiplanen.",
                  ],
                ].map(([h, p]) => (
                  <article key={h}>
                    <span className="cmp-tag">Må undersøkes</span>
                    <h3>{h}</h3>
                    <p>{p}</p>
                  </article>
                ))}
              </div>
            </>
          )}
          {tab === "sven" && (
            <>
              <div className="cmp-section-title">
                <h2>Sven peker ut hvor du kan begynne</h2>
                <span>{findings.length} områder over referansen</span>
              </div>
              <Sven small>
                <p>
                  Jeg har rangert områdene etter størrelsen på kostnadsavviket,
                  omregnet til {ownName}s befolkning. Dette er{" "}
                  <strong>
                    undersøkelsesforslag, ikke ferdige kuttforslag
                  </strong>
                  . Jeg trenger minst tre sammenligningskommuner med data for å
                  foreslå et område.
                </p>
              </Sven>
              <div className="cmp-findings">
                {findings.map((f, i) => (
                  <article className="cmp-finding" key={f.code}>
                    <div className="cmp-finding-number">
                      {String(i + 1).padStart(2, "0")}
                    </div>
                    <div>
                      <div className="cmp-eyebrow">
                        Sven foreslår å undersøke
                      </div>
                      <h3>{f.name}</h3>
                      <p>
                        {ownName} bruker {number(f.percent, 1)} % mer per
                        innbygger enn referansen. Undersøk om forskjellen
                        skyldes behov, tjenestenivå eller organisering.
                      </p>
                      <div className="cmp-finding-meta">
                        <span>Regnskap {year}</span>
                        <span>{f.reference.count} kommuner med data</span>
                        <span>Ikke behovskorrigert</span>
                      </div>
                    </div>
                    <div className="cmp-finding-value">
                      <strong>{money(f.gapAmount)}</strong>
                      <span>Kostnadsavvik · ikke innsparing</span>
                      <button onClick={() => addCandidate(f)}>
                        Ta med til vurdering +
                      </button>
                    </div>
                  </article>
                ))}
              </div>
              {!findings.length && (
                <p className="cmp-empty">
                  Ingen forslag med dette datagrunnlaget. Velg minst tre
                  kommuner med tilgjengelige data, eller prøv et annet år.
                </p>
              )}
              <p className="cmp-footnote">
                Områdene kan overlappe, blant annet eiendomsforvaltning og andre
                tjenester. Avvikene summeres derfor ikke til et samlet
                handlingsrom.
              </p>
            </>
          )}
          {tab === "budget" && (
            <>
              <div className="cmp-section-title">
                <h2>Mitt budsjettalternativ</h2>
                <span>{ownName} · lagres i denne nettleseren</span>
              </div>
              <Sven small>
                <p>
                  Her kan du vurdere mine undersøkelsesforslag og legge inn egne
                  tiltak. Beløpene er <strong>dine forutsetninger</strong>. Jeg
                  har ikke validert dem mot kommunens budsjett, lovkrav eller
                  avtaler.
                </p>
              </Sven>
              {storageError && (
                <p role="alert" className="cmp-warning">
                  {storageError}
                </p>
              )}
              <div className="cmp-budget-tools">
                <label>
                  Første budsjettår
                  <select
                    value={budgetStart}
                    onChange={(e) => setBudgetStart(+e.target.value)}
                  >
                    {[2026, 2027, 2028, 2029, 2030, 2031].map((y) => (
                      <option key={y}>{y}</option>
                    ))}
                  </select>
                </label>
                <button
                  onClick={() =>
                    download(
                      `budsjettalternativ-${code}.json`,
                      JSON.stringify({ municipality: code, items }, null, 2),
                      "application/json",
                    )
                  }
                >
                  Eksporter tiltak ↓
                </button>
                <button
                  onClick={() =>
                    download(
                      `budsjetteffekt-${code}.csv`,
                      csv([
                        [
                          "Tiltak / scenario",
                          ...Array.from(
                            { length: 4 },
                            (_, i) => budgetStart + i,
                          ),
                        ],
                        ...items.map((item) => [
                          item.name,
                          ...Array.from({ length: 4 }, (_, i) =>
                            scenarioTotal([item], budgetStart + i),
                          ),
                        ]),
                        [
                          "Sum (mill. kr)",
                          ...Array.from({ length: 4 }, (_, i) =>
                            scenarioTotal(items, budgetStart + i),
                          ),
                        ],
                        [
                          "Forbehold",
                          "Brukerforutsetninger. Ikke validerte innsparinger.",
                        ],
                      ]),
                      "text/csv;charset=utf-8",
                    )
                  }
                >
                  Eksporter fireårseffekt ↓
                </button>
              </div>
              <div className="cmp-year-totals">
                {Array.from({ length: 4 }, (_, i) => budgetStart + i).map(
                  (y) => (
                    <div key={y}>
                      <span>{y}</span>
                      <strong>
                        {number(scenarioTotal(items, y), 1)}{" "}
                        <small>mill. kr</small>
                      </strong>
                      <p>Netto scenarioeffekt</p>
                    </div>
                  ),
                )}
              </div>
              <div className="cmp-budget-list">
                {items.map((item) => (
                  <article key={item.id} className="cmp-budget-item">
                    <div className="cmp-panel-head">
                      <label className="cmp-toggle">
                        <input
                          type="checkbox"
                          checked={item.enabled}
                          onChange={(e) =>
                            patchItem(item.id, { enabled: e.target.checked })
                          }
                        />
                        <strong>{item.name}</strong>
                      </label>
                      <button
                        onClick={() =>
                          setItems((old) => old.filter((i) => i.id !== item.id))
                        }
                      >
                        Fjern
                      </button>
                    </div>
                    {item.source && (
                      <p className="cmp-footnote">{item.source}</p>
                    )}
                    <div className="cmp-budget-fields">
                      <label>
                        Årlig nettoeffekt, mill. kr
                        <input
                          type="number"
                          min="0"
                          step="0.1"
                          value={item.annual}
                          onChange={(e) =>
                            patchItem(item.id, {
                              annual: Math.max(0, Number(e.target.value)),
                            })
                          }
                        />
                      </label>
                      <label>
                        Oppstartskostnad, mill. kr
                        <input
                          type="number"
                          min="0"
                          step="0.1"
                          value={item.oneOff}
                          onChange={(e) =>
                            patchItem(item.id, {
                              oneOff: Math.max(0, Number(e.target.value)),
                            })
                          }
                        />
                      </label>
                      <label>
                        Oppstartsår
                        <input
                          type="number"
                          min="2026"
                          max="2100"
                          value={item.start}
                          onChange={(e) =>
                            patchItem(item.id, {
                              start: Math.max(
                                2026,
                                Math.min(2100, Number(e.target.value)),
                              ),
                            })
                          }
                        />
                      </label>
                      <label>
                        Effekt første år, %
                        <input
                          type="number"
                          min="0"
                          max="100"
                          value={item.firstYearShare}
                          onChange={(e) =>
                            patchItem(item.id, {
                              firstYearShare: Math.min(
                                100,
                                Math.max(0, Number(e.target.value)),
                              ),
                            })
                          }
                        />
                      </label>
                    </div>
                    <label>
                      Dokumentasjon, konsekvenser og mulig overlapp
                      <textarea
                        maxLength="4000"
                        value={item.note || ""}
                        onChange={(e) =>
                          patchItem(item.id, { note: e.target.value })
                        }
                        placeholder="Hvilken budsjettpost påvirkes? Er effekten allerede innarbeidet? Hvilke konsekvenser får tiltaket?"
                      />
                    </label>
                    <p className="cmp-muted">
                      {item.enabled
                        ? "Inkludert i scenarioet."
                        : "Ikke inkludert i scenarioet."}{" "}
                      Ingen automatisk kontroll av overlapp eller
                      gjennomførbarhet.
                    </p>
                  </article>
                ))}
              </div>
              {!items.length && (
                <div className="cmp-empty">
                  <h3>Bygg alternativet ditt, ett tiltak om gangen.</h3>
                  <p>
                    Begynn med Svens forslag, eller legg inn et eget tiltak
                    nedenfor.
                  </p>
                  <button onClick={() => setTab("sven")}>
                    Se Svens forslag →
                  </button>
                </div>
              )}
              <form
                className="cmp-add-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (
                    !newName.trim() ||
                    !Number.isFinite(Number(newAnnual)) ||
                    Number(newAnnual) < 0
                  )
                    return;
                  setItems((old) => [
                    ...old,
                    {
                      id: crypto.randomUUID(),
                      name: newName.trim(),
                      annual: Number(newAnnual),
                      oneOff: 0,
                      start: budgetStart,
                      firstYearShare: 100,
                      enabled: false,
                      note: "",
                    },
                  ]);
                  setNewName("");
                  setNewAnnual("");
                  setMessage(
                    "Tiltaket er lagt til. Kryss av for å inkludere det i scenarioet.",
                  );
                }}
              >
                <h3>Legg til eget tiltak</h3>
                <div>
                  <label>
                    Beskriv tiltaket
                    <input
                      required
                      maxLength="180"
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      placeholder="For eksempel samordne innkjøp"
                    />
                  </label>
                  <label>
                    Årlig nettoeffekt, mill. kr
                    <input
                      required
                      type="number"
                      min="0"
                      step="0.1"
                      value={newAnnual}
                      onChange={(e) => setNewAnnual(e.target.value)}
                    />
                  </label>
                  <button className="cmp-primary" type="submit">
                    Legg til tiltak +
                  </button>
                </div>
              </form>
            </>
          )}
        </>
      )}
      {!publishedBudget && (
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
              avskrivninger, endrede kommunegrenser og ulik kvalitet. Historiske
              tall er ikke et anslag på neste års budsjett. Ingen
              Framsikt-budsjetter, kvalitetsdata eller ASSS-korreksjoner er koblet
              til ennå. Svens observasjoner kommer fra åpne, faste
              beregningsregler, ikke en språkmodell.
            </p>
            <p>
              <strong>Tilgang:</strong> Dette er en åpen forhåndsvisning av en
              planlagt betaltjeneste. Betaling og serverbasert abonnementskontroll
              er ikke aktivert. Tiltak lagres bare lokalt på denne enheten, per
              kommune. Bruk eksport for å ta vare på dem.
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
      )}
      <footer className="cmp-footer">
        <span>Fellestall Pluss</span>
        <span>Et bedre grunnlag for lokale beslutninger.</span>
      </footer>
    </section>
  );
}
