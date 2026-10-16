import { useEffect, useMemo } from "react";
import { DoubleSide } from "three";
import type { ThreeEvent } from "@react-three/fiber";
import { useScenario } from "../state/scenario";
import { useCity } from "../state/store";
import type { SurfaceSampler } from "../geo/surface";
import { trafficGeometry } from "../geo/traffic";
import type { CityData } from "../geo/types";
export default function TrafficOverlay({
  data,
  surface,
}: {
  data: CityData;
  surface: SurfaceSampler;
}) {
  const { network, phase, compare, policy, heatmap, baseline, intervention } =
    useScenario();
  const showingBaseline = compare || policy === "baseline";
  const result = compare ? baseline : intervention;
  const corridor = useMemo(
    () =>
      network
        ? trafficGeometry(network, null, surface, true, showingBaseline)
        : null,
    [network, surface, showingBaseline],
  );
  const traffic = useMemo(
    () =>
      network && heatmap && result && result.tick > 0
        ? trafficGeometry(network, result, surface, false, showingBaseline)
        : null,
    [network, heatmap, result, surface, showingBaseline],
  );
  useEffect(
    () => () => {
      corridor?.geometry.dispose();
    },
    [corridor],
  );
  useEffect(
    () => () => {
      traffic?.geometry.dispose();
    },
    [traffic],
  );
  if (phase === "closed") return null;
  const pick = (
    e: ThreeEvent<MouseEvent>,
    batch: NonNullable<typeof corridor>,
  ) => {
    if (e.delta > 4 || e.faceIndex == null) return;
    const face = e.faceIndex;
    const id = batch.ranges.find((r) => face < r.end)?.wayId;
    const road = data.roads.find((r) => r.id === id);
    if (road) {
      e.stopPropagation();
      useCity.getState().select(road);
    }
  };
  return (
    <>
      {corridor && (
        <mesh
          geometry={corridor.geometry}
          renderOrder={1}
          onClick={(e) => pick(e, corridor)}
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
