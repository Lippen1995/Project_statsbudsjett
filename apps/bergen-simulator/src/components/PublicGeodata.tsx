import { useEnhancements } from "../enhancements/state";
import catalogue from "../enhancements/catalogue.json";

export default function PublicGeodata() {
  const enabled = useEnhancements((s) => s.enabled);
  const status = useEnhancements((s) => s.status);
  const setEnabled = useEnhancements((s) => s.setEnabled);
  return (
    <div className="public-geodata-control">
      <label>
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
        />
        Kartverket roof pilot (2022)
      </label>
      <p className="data-note" role="status">
        {enabled
          ? status === "ready"
            ? `${catalogue.buildings.length} source-derived roofs loaded.`
            : status === "unavailable"
              ? "Roof data unavailable; original view retained."
              : status === "paused"
                ? "Pilot paused in low power or outside Bryggen."
                : "Loading source-derived roofs…"
          : "Compare derived roof volumes with the original snapshot."}{" "}
        Estimated from 2022 public elevation data; facades remain schematic.
      </p>
    </div>
  );
}
