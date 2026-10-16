import { useCity } from "../state/store";
import type { Building } from "../geo/types";

export default function Inspector() {
  const selected = useCity((s) => s.selected);
  const select = useCity((s) => s.select);
  const focus = useCity((s) => s.focus);
  const building =
    selected?.kind === "building" ? (selected as Building) : null;
  return (
    <section
      className="inspector"
      aria-label="Object inspector"
      aria-live="polite"
    >
      <div className="section-heading">
        <h2>Object inspector</h2>
        {selected ? (
          <button
            className="icon-button"
            onClick={() => select(null)}
            aria-label="Clear selection"
          >
            ×
          </button>
        ) : (
          <span className="tiny-label">INSPECT</span>
        )}
      </div>
      {selected ? (
        <>
          <span className="eyebrow">{selected.kind} · OpenStreetMap</span>
          <h3>{selected.name}</h3>
          <dl>
            <div>
              <dt>Map reference</dt>
              <dd>{selected.id}</dd>
            </div>
            <div>
              <dt>Latitude</dt>
              <dd>{selected.location[1].toFixed(5)}° N</dd>
            </div>
            <div>
              <dt>Longitude</dt>
              <dd>{selected.location[0].toFixed(5)}° E</dd>
            </div>
            {building ? (
              <div>
                <dt>Rendered height</dt>
                <dd>
                  {building.height === null
                    ? "Unknown · footprint only"
                    : `${building.height.toFixed(1)} m`}
                </dd>
              </div>
            ) : null}
          </dl>
          {building ? (
            <p className="data-note">
              <span
                className={
                  "data-dot " +
                  (building.heightStatus === "osm-height" ? "observed" : "")
                }
              />
              {building.heightStatus === "osm-height"
                ? "Height reported in OSM; not survey verified."
                : building.heightStatus === "levels-estimate"
                  ? "Estimated height: OSM storeys × 3 m."
                  : "Footprint only. No height or storey count is available; no height has been assigned."}
            </p>
          ) : (
            <p className="data-note">
              {selected.kind === "road"
                ? "Observed centreline. Width is schematic; elevation is sampled from the terrain model."
                : "Location from OpenStreetMap. Terrain elevation from a regional DEM."}
            </p>
          )}
          <button
            className="secondary-button"
            onClick={() => focus(selected.center)}
          >
            Focus on object <span>↗</span>
          </button>
          <a
            className="source-link"
            href={"https://www.openstreetmap.org/" + selected.id}
            target="_blank"
            rel="noreferrer"
          >
            View source on OpenStreetMap ↗
          </a>
        </>
      ) : (
        <div className="empty-inspector">
          <span className="selection-icon" aria-hidden="true">
            ⌖
          </span>
          <p>A city, one detail at a time.</p>
          <span>
            Select a building or street in the scene, or find a mapped place
            below.
          </span>
        </div>
      )}
    </section>
  );
}
