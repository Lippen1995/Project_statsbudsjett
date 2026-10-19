import type { CityData } from "../geo/types";
import { LANDMARK_ID, LANDMARK_VIEWS } from "../architecture/inspection";
import { useCity } from "../state/store";

/** Bounded read-only landmark tour, independent of saved game scenarios. */
export default function LandmarkInspection({ data }: { data: CityData }) {
  const current = useCity((s) => s.camera.landmark);
  const inspect = useCity((s) => s.inspectLandmark);
  const focus = useCity((s) => s.focus);
  const select = useCity((s) => s.select);
  const enter = () => {
    const b = data.buildings.find((b) => b.id === LANDMARK_ID);
    if (b) select(b);
    inspect("gable");
  };
  return (
    <nav className="landmark-inspection" aria-label="Skur 11 inspection">
      {!current ? (
        <button onClick={enter}>Skur 11 · street inspection ↘</button>
      ) : (
        <>
          <span>SKUR 11 · HISTORICAL RECONSTRUCTION</span>
          <div>
            {LANDMARK_VIEWS.map((v) => (
              <button
                key={v.id}
                aria-pressed={current === v.id}
                onClick={() => inspect(v.id)}
              >
                {v.name}
              </button>
            ))}
          </div>
          <div>
            <button onClick={() => inspect(current, true)}>
              Skip movement
            </button>
            <button onClick={() => focus(null)}>Back to Bergen ↗</button>
          </div>
          <small>
            Drag to orbit · pinch/scroll to zoom. Unknown north end is
            schematic.
          </small>
        </>
      )}
    </nav>
  );
}
