import { useEffect, useMemo, useRef } from "react";
import { useThree, type ThreeEvent } from "@react-three/fiber";
import {
  BufferGeometry,
  Float32BufferAttribute,
  DoubleSide,
  InstancedMesh,
  Matrix4,
  Color,
  type BufferGeometry as Geometry,
} from "three";
import { useScenario } from "../state/scenario";
import { usePhysical } from "../state/physical";
import { useAccess } from "../state/access";
import {
  accessPlacement,
  attachmentPoints,
  corridor,
  terrainPortal,
} from "../access/model";
import { distance } from "../physical/polygon";
import type { Point } from "../geo/types";
import type { SurfaceSampler } from "../geo/surface";
const EMPTY: never[] = [];
export default function ProposedAccess({
  terrain,
  surface,
}: {
  terrain: Geometry;
  surface: SurfaceSampler;
}) {
  const s = useScenario(),
    a = useAccess(),
    mode = usePhysical((p) => p.mode),
    invalidate = useThree((t) => t.invalidate),
    nodes = useRef<InstancedMesh>(null);
  const proposals =
    s.mapView === "baseline" || !s.showBuildings
      ? EMPTY
      : s.mapView === "reference"
        ? (s.library.find((p) => p.id === s.referenceId)?.scenario.access
            ?.connections ?? EMPTY)
        : (s.access?.connections ?? EMPTY);
  const draft =
    mode === "access" && s.mapView === "plan" && s.showBuildings
      ? a.draft
      : null;
  const targets = useMemo(
    () =>
      s.network
        ? attachmentPoints(s.network).filter(
            (n) =>
              n.point[0] >= -145 &&
              n.point[0] <= 145 &&
              n.point[1] >= -335 &&
              n.point[1] <= -65,
          )
        : [],
    [s.network],
  );
  const geometry = useMemo(() => {
    const positions: number[] = [],
      colors: number[] = [];
    for (const p of [
      ...proposals.filter((p) => p.id !== draft?.id),
      ...(draft ? [draft] : []),
    ]) {
      if (p.points.some((q) => !q.every(Number.isFinite))) continue;
      const check =
        s.context && s.development
          ? accessPlacement(p, s.context, s.development, s.physical, proposals)
          : null;
      const color = new Color(
        p === draft && !check?.valid
          ? "#ed785f"
          : p.mode === "vehicle"
            ? "#ffcc78"
            : "#77dfd2",
      );
      for (let i = 1; i < p.points.length; i++) {
        const from = p.points[i - 1],
          to = p.points[i],
          len = distance(from, to);
        if (len < 0.01 || len > 80) continue;
        for (let k = 0; k < len; k += 3) {
          const at = (d: number): Point => [
              from[0] + ((to[0] - from[0]) * d) / len,
              from[1] + ((to[1] - from[1]) * d) / len,
            ],
            strip = corridor(
              at(k),
              at(Math.min(len, k + 1.9)),
              p.mode === "vehicle" ? 3 : 1.5,
            );
          const vertices = strip.map(([x, z]) => [
            x,
            (surface(x, z) ?? 0) + 0.85,
            z,
          ]);
          for (const j of [0, 1, 2, 0, 2, 3]) {
            positions.push(...vertices[j]);
            colors.push(color.r, color.g, color.b);
          }
        }
      }
    }
    const g = new BufferGeometry();
    g.setAttribute("position", new Float32BufferAttribute(positions, 3));
    g.setAttribute("color", new Float32BufferAttribute(colors, 3));
    g.computeBoundingSphere();
    return g;
  }, [proposals, draft, s.context, s.development, s.physical, surface]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(() => {
    const mesh = nodes.current;
    if (!mesh) return;
    const m = new Matrix4();
    targets.forEach((n, i) => {
      m.makeTranslation(
        n.point[0],
        (surface(...n.point) ?? 0) + 1.5,
        n.point[1],
      );
      mesh.setMatrixAt(i, m);
      mesh.setColorAt(
        i,
        new Color(n.id === draft?.nodeId ? "#fff6d1" : "#e1b66b"),
      );
    });
    if (draft)
      draft.points.slice(0, -1).forEach((p, i) => {
        if (p.every(Number.isFinite)) {
          m.makeScale(0.65, 0.65, 0.65);
          m.setPosition(p[0], (surface(...p) ?? 0) + 2, p[1]);
        } else m.makeScale(0, 0, 0);
        mesh.setMatrixAt(targets.length + i, m);
        mesh.setColorAt(
          targets.length + i,
          new Color(i === a.vertex ? "#fff4d0" : "#82dfda"),
        );
      });
    mesh.count = targets.length + (draft?.points.length ?? 1) - 1;
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    invalidate();
  }, [
    targets,
    surface,
    draft,
    a.vertex,
    invalidate,
    mode,
    s.showBuildings,
    s.mapView,
  ]);
  const nodePick = (e: ThreeEvent<MouseEvent>) => {
    if (e.delta > 4 || e.instanceId == null || !a.draft) return;
    e.stopPropagation();
    if (e.instanceId < targets.length) a.chooseNode(targets[e.instanceId].id);
    else {
      a.setVertex(e.instanceId - targets.length);
      a.setDrawing(true);
    }
  };
  return (
    <>
      {geometry.attributes.position.count > 0 && (
        <mesh geometry={geometry} renderOrder={4}>
          <meshBasicMaterial
            vertexColors
            side={DoubleSide}
            toneMapped={false}
          />
        </mesh>
      )}
      {mode === "access" &&
        draft &&
        s.mapView === "plan" &&
        s.showBuildings && (
          <instancedMesh
            ref={nodes}
            args={[undefined, undefined, 32]}
            onClick={nodePick}
            renderOrder={5}
          >
            <sphereGeometry args={[2.8, 8, 6]} />
            <meshBasicMaterial color="#e1b66b" depthTest={false} />
          </instancedMesh>
        )}
      {mode === "access" && a.drawing && draft && s.mapView === "plan" && (
        <mesh
          geometry={terrain}
          onClick={(e) => {
            if (e.delta > 4) return;
            e.stopPropagation();
            const point: Point = [e.point.x, e.point.z],
              owner = s.development?.proposals.find(
                (b) => b.id === draft.buildingId,
              );
            a.move(
              a.vertex,
              a.vertex === 0 && owner ? terrainPortal(owner, point) : point,
            );
          }}
        >
          <meshBasicMaterial
            transparent
            opacity={0}
            depthWrite={false}
            side={DoubleSide}
          />
        </mesh>
      )}
    </>
  );
}
