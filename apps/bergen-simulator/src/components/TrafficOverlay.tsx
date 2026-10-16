import { useEffect, useMemo } from "react";
import { DoubleSide } from "three";
import type { ThreeEvent } from "@react-three/fiber";
import { useScenario } from "../state/scenario";
import { useCity } from "../state/store";
import { segmentId, segments } from "../simulation/interventions";
import type { SurfaceSampler } from "../geo/surface";
import { trafficGeometry, type StreetStyle } from "../geo/traffic";
import type { CityData } from "../geo/types";
export const EDIT_COLORS = {
  all: "#e6c073",
  local: "#f4ba60",
  service: "#cc9fdf",
  closed: "#ee8775",
};
export default function TrafficOverlay({
  data,
  surface,
}: {
  data: CityData;
  surface: SurfaceSampler;
}) {
  const {
    network,
    plan,
    referenceId,
    library,
    mapView,
    heatmap,
    baseline,
    intervention,
    reference,
  } = useScenario();
  const selectedId = useCity((s) => s.selectedSegmentId);
  const displayPlan =
    mapView === "plan"
      ? plan
      : mapView === "reference"
        ? library.find((p) => p.id === referenceId)?.scenario.plan
        : null;
  const result =
    mapView === "baseline"
      ? baseline
      : mapView === "reference"
        ? reference
        : intervention;
  const outlines = useMemo(() => {
    if (!network) return null;
    const edits = new Map(
      displayPlan?.interventions.map((e) => [e.segmentId, e]) ?? [],
    );
    const styles: Record<string, StreetStyle> = {};
    for (const edge of segments(network)) {
      const id = segmentId(edge),
        edit = edits.get(id),
        selected = id === selectedId;
      styles[id] = {
        width: selected ? 15 : edit ? 12 : 8,
        color: selected
          ? "#fff8df"
          : edit
            ? EDIT_COLORS[edit.access]
            : "#739f9e",
        alternate: edit && !selected ? "#486f75" : undefined,
      };
    }
    return trafficGeometry(network, null, surface, false, false, styles);
  }, [network, displayPlan, surface, selectedId]);
  const traffic = useMemo(
    () =>
      network && heatmap && result && result.tick > 0
        ? trafficGeometry(
            network,
            result,
            surface,
            false,
            mapView === "baseline",
          )
        : null,
    [network, heatmap, result, surface, mapView],
  );
  useEffect(() => () => outlines?.geometry.dispose(), [outlines]);
  useEffect(() => () => traffic?.geometry.dispose(), [traffic]);
  const pick = (
    event: ThreeEvent<MouseEvent>,
    batch: NonNullable<typeof outlines>,
  ) => {
    if (event.delta > 4 || event.faceIndex == null) return;
    const face = event.faceIndex,
      section = batch.ranges.find((r) => face < r.end);
    const road = data.roads.find((r) => r.id === section?.wayId);
    if (road && section) {
      event.stopPropagation();
      useCity.getState().select(road, section.segmentId);
    }
  };
  return (
    <>
      {outlines && (
        <mesh
          geometry={outlines.geometry}
          renderOrder={1}
          onClick={(e) => pick(e, outlines)}
        >
          <meshBasicMaterial
            vertexColors
            side={DoubleSide}
            toneMapped={false}
          />
        </mesh>
      )}
      {traffic && (
        <mesh
          geometry={traffic.geometry}
          renderOrder={2}
          onClick={(e) => pick(e, traffic)}
        >
          <meshBasicMaterial
            vertexColors
            side={DoubleSide}
            toneMapped={false}
          />
        </mesh>
      )}
    </>
  );
}
