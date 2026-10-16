import {
  Component,
  Suspense,
  lazy,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import Inspector from "./components/Inspector";
import { useCity, type Layer } from "./state/store";
import { parseCityData, type CityData } from "./geo/types";

const Scene = lazy(() => import("./components/Scene"));
const formatter = new Intl.NumberFormat("en-GB");

class SceneBoundary extends Component<
  { children: ReactNode },
  { error: boolean }
> {
  state = { error: false };
  static getDerivedStateFromError() {
    return { error: true };
  }
  render() {
    return this.state.error ? (
      <div className="scene-error" role="alert">
        <h2>The 3D view could not start</h2>
        <p>
          Try a browser with WebGL enabled, or reload this page. No substitute
          geography has been loaded.
        </p>
        <button className="secondary-button" onClick={() => location.reload()}>
          Reload scene
        </button>
      </div>
    ) : (
      this.props.children
    );
  }
}

function MountainMark() {
  return (
    <svg viewBox="0 0 40 32" fill="none" aria-hidden="true">
      <path
        d="M2 27 15 5l9 14 5-8 9 16"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
      <path d="m11 12 4 4 4-4" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function Sidebar({ data }: { data: CityData }) {
  const layers = useCity((s) => s.layers);
  const toggleLayer = useCity((s) => s.toggleLayer);
  const quality = useCity((s) => s.quality);
  const setQuality = useCity((s) => s.setQuality);
  const select = useCity((s) => s.select);
  const focus = useCity((s) => s.focus);
  const [search, setSearch] = useState("");
  const places = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    const all = [
      ...data.landmarks,
      ...data.buildings.filter((b) => b.tags.name),
    ];
    return all
      .filter((f, i) => all.findIndex((other) => other.id === f.id) === i)
      .filter((f) => !query || f.name.toLocaleLowerCase().includes(query))
      .slice(0, query ? 8 : 4);
  }, [data, search]);
  return (
    <aside className="sidebar">
      <div className="sidebar-intro">
        <span className="eyebrow">A CITY IN PERSPECTIVE</span>
        <h1>
          Bergen,
          <br />
          <em>reimagined.</em>
        </h1>
        <p>
          Between the mountains and the sea.
          <br />
          Explore the city we share.
        </p>
      </div>
      <div className="snapshot-stats">
        <div>
          <strong>{formatter.format(data.buildings.length)}</strong>
          <span>mapped buildings</span>
        </div>
        <div>
          <strong>{formatter.format(data.roads.length)}</strong>
          <span>street segments</span>
        </div>
      </div>
      <section className="layers" aria-label="Map layers">
        <div className="section-heading">
          <h2>Map layers</h2>
          <span className="tiny-label">VISIBILITY</span>
        </div>
        {(
          [
            ["buildings", "Buildings", "Observed footprints", "▥"],
            ["roads", "Streets & paths", "Observed centrelines", "≋"],
            ["water", "Water", "Mapped coast & lakes", "≈"],
          ] as const
        ).map(([key, title, subtitle, icon]) => (
          <label className="layer" key={key}>
            <span className={"layer-icon " + key} aria-hidden="true">
              {icon}
            </span>
            <span className="layer-copy">
              <strong>{title}</strong>
              <small>{subtitle}</small>
            </span>
            <input
              type="checkbox"
              role="switch"
              aria-label={title}
              checked={layers[key as Layer]}
              onChange={() => toggleLayer(key)}
            />
          </label>
        ))}
        <p className="terrain-note">
          <span className="legend-swatch" />
          Terrain · real elevation, 1:1 scale
        </p>
      </section>
      <Inspector />
      <section className="places">
        <div className="section-heading">
          <h2>Find a place</h2>
          <span className="tiny-label">EXPLORE</span>
        </div>
        <label className="search-label">
          <span aria-hidden="true">⌕</span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search mapped places"
            aria-label="Search mapped places"
          />
        </label>
        <div className="place-list">
          {places.length ? (
            places.map((f) => (
              <button
                key={f.id}
                onClick={() => {
                  select(f);
                  focus(f.center);
                }}
              >
                <span>{f.name}</span>
                <span aria-hidden="true">↗</span>
              </button>
            ))
          ) : (
            <p className="data-note">No named places match this search.</p>
          )}
        </div>
      </section>
      <div className="sidebar-bottom">
        <label htmlFor="quality">Rendering</label>
        <select
          id="quality"
          value={quality}
          onChange={(e) => setQuality(e.target.value as "balanced" | "low")}
        >
          <option value="balanced">Balanced</option>
          <option value="low">Low power</option>
        </select>
        <p>
          Independent development prototype
          <br />
          Bergen is the first chapter.
        </p>
      </div>
    </aside>
  );
}

export default function App() {
  const [data, setData] = useState<CityData | null>(null);
  const [error, setError] = useState("");
  const [showSources, setShowSources] = useState(false);
  const focus = useCity((s) => s.focus);
  const selected = useCity((s) => s.selected);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/data/bergen.json", { signal: controller.signal })
      .then((response) => {
        if (!response.ok)
          throw new Error(
            `Geographic snapshot unavailable (${response.status}).`,
          );
        return response.json();
      })
      .then(parseCityData)
      .then(setData)
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      });
    return () => controller.abort();
  }, []);
  return (
    <div className="app-shell">
      <header className="topbar">
        <a href="./" className="wordmark" aria-label="Bergen Reimagined home">
          <MountainMark />
          <span>
            BERGEN<span className="wordmark-light">REIMAGINED</span>
          </span>
        </a>
        <div className="header-center">
          GEOGRAPHIC EXPLORER <span>02A / BERGEN</span>
        </div>
        <span className="prototype-badge">
          <span />
          DEVELOPMENT
        </span>
      </header>
      <main className="main-layout">
        {data ? (
          <Sidebar data={data} />
        ) : (
          <aside className="sidebar">
            <div className="sidebar-intro">
              <h1>
                Bergen,
                <br />
                <em>reimagined.</em>
              </h1>
              <p>{error || "Loading the geographic snapshot…"}</p>
            </div>
          </aside>
        )}
        <section className="viewport" aria-label="Bergen geographic explorer">
          {data ? (
            <SceneBoundary>
              <Suspense
                fallback={
                  <div className="scene-loading">
                    Preparing Bergen’s terrain…
                  </div>
                }
              >
                <Scene data={data} />
              </Suspense>
            </SceneBoundary>
          ) : (
            <div className="scene-loading" role={error ? "alert" : "status"}>
              {error || "Loading verified geography…"}
            </div>
          )}
          <div className="map-title">
            <span className="map-tag">NORWAY / VESTLAND</span>
            <h2>Central Bergen</h2>
            <p>60°23′ N · 5°19′ E</p>
          </div>
          <div className="map-status">
            <span className="status-dot" />
            {selected ? selected.name : "Explore mode"}
            <span className="status-separator" />
            3D VIEW
          </div>
          <div className="view-controls">
            <button
              aria-label="Reset overview and north direction"
              title="Reset overview (R)"
              onClick={() => focus(null)}
            >
              <span className="north-arrow">↑</span>
              <span>N</span>
            </button>
            <button
              aria-label="Fit central Bergen overview"
              title="Fit city overview"
              onClick={() => focus(null)}
            >
              ⛶
            </button>
          </div>
          <div className="map-bottom">
            <div className="navigation-hint">
              <span>↔</span>Drag to orbit <i />
              Right-drag to pan <i />
              Scroll to zoom
            </div>
            <button
              className="source-button"
              aria-expanded={showSources}
              onClick={() => setShowSources(!showSources)}
            >
              ⓘ Data & accuracy
            </button>
          </div>
          {showSources && data ? (
            <section className="sources-panel" aria-label="Data and accuracy">
              <div className="section-heading">
                <h2>Real places. Honest geometry.</h2>
                <button
                  className="icon-button"
                  onClick={() => setShowSources(false)}
                  aria-label="Close data and accuracy"
                >
                  ×
                </button>
              </div>
              <p>
                Footprints, streets and coastline: © OpenStreetMap
                contributors, ODbL. Snapshot{" "}
                {data.provenance.osmTimestamp.slice(0, 10)}.
              </p>
              <p>
                Terrain: © Kartverket, CC BY 4.0. Bergen laser projects 2022 /
                2023, NN2000 heights. A 2 m DTM crop sampled to a{" "}
                {data.provenance.terrainResolution} m display mesh. No vertical
                exaggeration.
              </p>
              <p>
                Building heights use OSM height tags where available. Storeys ×
                3 m is explicitly estimated; buildings with no height or storey
                data remain draped footprints. Gables require explicit total and
                roof heights plus a compatible mapped footprint; inferred ridge
                directions are labelled. Foundations are schematic
                ground-contact skirts. Colours, lighting and water ripples are
                artistic.
              </p>
              <p>
                Coast and lake outlines retain the original OSM mapping. Water
                levels are schematic, not tides. Green areas sample mapped OSM
                landcover. Unresolved bridge decks and subsurface roads are
                omitted from the surface view; their source records are
                retained.
              </p>
              <p>
                Mapped crop: {data.bounds[0]}–{data.bounds[2]}° E,{" "}
                {data.bounds[1]}–{data.bounds[3]}° N. Outside this crop, distant
                water and atmosphere are an illustrative backdrop.
              </p>
              <p>
                This is a geographic prototype. Simulation and policy controls
                are planned.
              </p>
              <a
                href="https://www.openstreetmap.org/copyright"
                target="_blank"
                rel="noreferrer"
              >
                OpenStreetMap licence ↗
              </a>
              <br />
              <a href="/data/NOTICE.md" target="_blank" rel="noreferrer">
                Full terrain credits & transformation notes ↗
              </a>
            </section>
          ) : null}
          <div className="map-attribution">
            © OpenStreetMap contributors · Terrain: © Kartverket · CC BY 4.0
          </div>
        </section>
      </main>
    </div>
  );
}
