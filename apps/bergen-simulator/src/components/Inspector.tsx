import catalogue from "../architecture/catalogue.json";
import { useArchitecture } from "../architecture/state";
import { useCity } from "../state/store";
import type { Building } from "../geo/types";
import { gableProfile } from "../geo/roofs";
import { inHeroBlock } from "../geo/benchmark";

export default function Inspector() {
  const assetStatus = useArchitecture((s) => s.status);
  const selected = useCity((s) => s.selected);
  const select = useCity((s) => s.select);
  const inspectLandmark = useCity((s) => s.inspectLandmark);
  const inspect = useCity((s) => s.inspect);
  const building =
    selected?.kind === "building" ? (selected as Building) : null;
  const asset = catalogue.buildings.find((b) => b.id === building?.id);
  const roof = building ? gableProfile(building) : null;
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
          {asset ? (
            <p className="data-note benchmark-note">
              R1B architectural study · {asset.label}.{" "}
              {assetStatus === "ready"
                ? "Detailed render layer loaded."
                : assetStatus === "unavailable"
                  ? "Architectural detail unavailable; original schematic geometry retained."
                  : "Schematic fallback; detail streams at near balanced zoom."}{" "}
              {asset.roof.accepted
                ? `Roof envelope inferred from Kartverket 2022 laser surface: ridge ${asset.roof.ridgeNN2000} m NN2000, eave ${asset.roof.eaveNN2000} m NN2000; inlier fit error ${asset.roof.inlierRmseM} m. Not a building survey.`
                : "Laser roof fit rejected; original OSM roof dimensions retained."}{" "}
              {asset.facade}.
            </p>
          ) : null}
          {asset?.id === "way/393025479" ? (
            <p className="data-note">
              R1C landmark · six photo-inferred stone piers, recessed braced
              doors and corrugated relief. Dated references: David40226543
              (2009, CC BY-SA 3.0) and Jonatan Andersen (2012, CC BY-SA 3.0 NO).
              Positions and relief depths are approximate reconstruction; north
              end and hidden details remain schematic. Tier 1 describes visual
              delivery, not survey accuracy. No windows have been invented.
              <a
                href="/architecture/NOTICE.md"
                target="_blank"
                rel="noreferrer"
              >
                {" "}
                Source details and licences ↗
              </a>
            </p>
          ) : null}
          {asset && asset.id !== "way/393025479" ? (
            <p className="data-note">
              Facade imagery: Kognos / Wikimedia Commons, 3 October 2022 ·
              cropped and perspective-mapped ·{" "}
              <a
                href="https://commons.wikimedia.org/wiki/File:Panorama_of_Bryggen,_Bergen.jpg"
                target="_blank"
                rel="noreferrer"
              >
                source
              </a>{" "}
              ·{" "}
              <a
                href="https://creativecommons.org/licenses/by-sa/4.0/"
                target="_blank"
                rel="noreferrer"
              >
                CC BY-SA 4.0
              </a>
              . Historical appearance; no current tenancy, facade depth or
              surveyed opening dimensions asserted.
            </p>
          ) : null}
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
                    : asset && assetStatus === "ready"
                      ? `${(asset.roof.ridgeNN2000 - building.elevation).toFixed(1)} m render envelope; ${building.height.toFixed(1)} m original snapshot`
                      : `${building.height.toFixed(1)} m`}
                </dd>
              </div>
            ) : null}
          </dl>
          {building ? (
            <>
              <p className="data-note">
                <span
                  className={
                    "data-dot " +
                    (building.heightStatus === "osm-height" ? "observed" : "")
                  }
                />
                {asset ? "Original snapshot fallback: " : null}
                {building.heightStatus === "osm-height"
                  ? "Height reported in OSM; not survey verified."
                  : building.heightStatus === "levels-estimate"
                    ? "Estimated height: OSM storeys × 3 m."
                    : "Footprint only. No height or storey count is available; no height has been assigned."}
              </p>
              {inHeroBlock(building) ? (
                <p className="data-note benchmark-note">
                  R1 waterfront study ·{" "}
                  {building.tags["building:colour"]
                    ? `OSM wall colour: ${building.tags["building:colour"]}. `
                    : "Wall colour not documented. "}
                  {building.tags["roof:colour"]
                    ? `OSM roof colour: ${building.tags["roof:colour"]}. `
                    : "Roof colour not documented. "}
                  Surface grain, tonal grading and lighting are illustrative,
                  not a facade survey.{" "}
                  {asset
                    ? asset.id === "way/393025479"
                      ? "Historical photo-inferred relief on supported faces; north end remains schematic."
                      : "Only the photographed waterfront face has dated image detail; other faces remain schematic."
                    : "Windows and architectural details are not documented."}
                </p>
              ) : null}
              <p className="data-note">
                {roof
                  ? `Gabled roof: ${roof.height} m from OSM roof:height; included in total height. ${roof.orientation === "osm-direction" ? "Direction reported in OSM." : "Ridge direction inferred from the footprint; not survey verified."}`
                  : asset?.roof.accepted
                    ? "Roof form unresolved in the original snapshot; schematic fallback preserved. Separate render roof described above."
                    : "Roof form unresolved; simplified geometry retained."}{" "}
                Ground contact follows the 16 m terrain mesh; foundations and
                material tints are schematic.
              </p>
            </>
          ) : (
            <p className="data-note">
              {selected.kind === "road"
                ? "Observed centreline. Width uses a valid OSM width tag where present, otherwise a schematic road-class width. Surface edges follow the rendered terrain mesh. Bridge decks and subsurface roads are omitted until their elevations are verified."
                : "Location from OpenStreetMap. Terrain elevation from a regional DEM."}
            </p>
          )}
          {asset?.id === "way/393025479" ? (
            <button
              className="secondary-button"
              onClick={() => inspectLandmark("gable")}
            >
              Inspect Skur 11 at street level ↘
            </button>
          ) : null}
          <button
            className="secondary-button"
            onClick={() => inspect(selected)}
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
