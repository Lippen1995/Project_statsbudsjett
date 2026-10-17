import { useEffect, useMemo, useRef } from "react";
import { useThree, type ThreeEvent } from "@react-three/fiber";
import {
  DoubleSide,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  Raycaster,
  Vector2,
  Vector3,
  type BufferGeometry,
} from "three";
import type { SurfaceSampler } from "../geo/surface";
import type { Point } from "../geo/types";
import { useDistrict } from "../state/district";
import {
  developmentGeometry,
  applyDevelopmentActivity,
} from "../geo/development";
import {
  buildingPlacement,
  footprint,
  validateBuilding,
  type BuildingProposal,
} from "../physical/buildings";
import { inside } from "../physical/polygon";
import { useScenario } from "../state/scenario";
import { usePhysical } from "../state/physical";
import { useConstruction } from "../state/construction";
import { useCity } from "../state/store";
const EMPTY: never[] = [];
export function buildingHandles(b: BuildingProposal): Point[] {
  try {
    validateBuilding(b);
  } catch {
    return [];
  }
  const ring = footprint(b),
    angle = (b.rotation * Math.PI) / 180;
  return [
    b.center,
    [
      b.center[0] + Math.sin(angle) * (b.depth / 2 + 7),
      b.center[1] - Math.cos(angle) * (b.depth / 2 + 7),
    ],
    ring[2],
  ];
}
export default function ProposedBuildings({
  terrain,
  surface,
}: {
  terrain: BufferGeometry;
  surface: SurfaceSampler;
}) {
  const invalidate = useThree((v) => v.invalidate);
  const active = useDistrict((d) => d.active && d.tint),
    currentActivity = useDistrict((d) => d.current[d.month]),
    referenceActivity = useDistrict((d) => d.reference?.[d.month]);
  const s = useScenario(),
    c = useConstruction(),
    mode = usePhysical((p) => p.mode),
    handles = useRef<InstancedMesh>(null);
  const proposals =
    !s.showBuildings || s.mapView === "baseline"
      ? EMPTY
      : s.mapView === "reference"
        ? (s.library.find((p) => p.id === s.referenceId)?.scenario.development
            ?.proposals ?? EMPTY)
        : (s.development?.proposals ?? EMPTY);
  const draft =
    mode === "buildings" && s.mapView === "plan" && c.located && s.showBuildings
      ? c.draft
      : null;
  const batch = useMemo(
    () =>
      developmentGeometry(
        s.context
          ? [
              ...proposals.filter((b) => b.id !== draft?.id),
              ...(draft ? [draft] : []),
            ].map((b) => {
              const check = buildingPlacement(
                b,
                s.context!,
                s.physical,
                proposals,
              );
              return {
                building: b,
                baseY: check.baseY,
                invalid: b === draft && !check.valid,
                selected: b.id === c.selectedId || b === draft,
              };
            })
          : [],
        surface,
      ),
    [s.context, s.physical, proposals, draft, c.selectedId, surface],
  );
  useEffect(() => {
    const r = s.mapView === "reference" ? referenceActivity : currentActivity;
    const activity =
      active && r && s.mapView !== "baseline"
        ? new Map(r.buildings.map((b) => [b.id, b.utilization]))
        : null;
    applyDevelopmentActivity(batch, activity, draft?.id);
    invalidate();
  }, [
    active,
    currentActivity,
    referenceActivity,
    s.mapView,
    batch,
    draft?.id,
    invalidate,
  ]);
  useEffect(
    () => () => {
      batch.body.dispose();
      batch.edges.dispose();
    },
    [batch],
  );
  useEffect(() => {
    const mesh = handles.current;
    if (!mesh || !draft || !s.context) return;
    const check = buildingPlacement(draft, s.context, s.physical, proposals),
      matrix = new Matrix4();
    let count = 0;
    for (const [x, z] of buildingHandles(draft)) {
      matrix.makeTranslation(x, check.baseY + 1.3, z);
      mesh.setMatrixAt(count++, matrix);
    }
    mesh.count = count;
    mesh.instanceMatrix.needsUpdate = true;
  }, [draft, s.context, s.physical, proposals]);
  function select(e: ThreeEvent<MouseEvent>) {
    if (c.draft || e.delta > 4 || e.faceIndex == null) return;
    const hit = batch.ranges.find((r) => e.faceIndex! < r.end);
    if (!hit) return;
    e.stopPropagation();
    if (s.mapView !== "plan") {
      c.feedback("Comparison view. Show your plan to edit construction.");
      return;
    }
    usePhysical.getState().setMode("buildings");
    c.select(hit.id);
    useCity.getState().select(null);
  }
  return (
    <>
      {batch.body.getAttribute("position").count > 0 && (
        <mesh geometry={batch.body} onClick={select}>
          <meshLambertMaterial vertexColors side={DoubleSide} />
        </mesh>
      )}
      {batch.edges.getAttribute("position").count > 0 && (
        <lineSegments geometry={batch.edges}>
          <lineBasicMaterial vertexColors toneMapped={false} />
        </lineSegments>
      )}
      {draft && (
        <instancedMesh
          ref={handles}
          args={[undefined, undefined, 3]}
          count={0}
          frustumCulled={false}
          renderOrder={5}
        >
          <sphereGeometry args={[1.3, 8, 6]} />
          <meshBasicMaterial color="#fff3bf" depthTest={false} />
        </instancedMesh>
      )}
      <ConstructionPointer terrain={terrain} surface={surface} />
    </>
  );
}
function ConstructionPointer({
  terrain,
  surface,
}: {
  terrain: BufferGeometry;
  surface: SurfaceSampler;
}) {
  const { camera, gl, invalidate } = useThree();
  useEffect(() => {
    const canvas = gl.domElement,
      ray = new Raycaster(),
      ndc = new Vector2(),
      material = new MeshBasicMaterial({ side: DoubleSide }),
      mesh = new Mesh(terrain, material);
    let drag: {
      id: number;
      x: number;
      y: number;
      point: Point | null;
      building: BuildingProposal;
      action: string;
    } | null = null;
    function point(event: PointerEvent): Point | null {
      const rect = canvas.getBoundingClientRect();
      ndc.set(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        (-(event.clientY - rect.top) / rect.height) * 2 + 1,
      );
      ray.setFromCamera(ndc, camera);
      const hit = ray.intersectObject(mesh, false)[0];
      return hit ? [+hit.point.x.toFixed(2), +hit.point.z.toFixed(2)] : null;
    }
    function start(e: PointerEvent) {
      const c = useConstruction.getState();
      if (
        usePhysical.getState().mode !== "buildings" ||
        !c.draft ||
        c.action === "navigate" ||
        e.button !== 0 ||
        drag
      )
        return;
      const b = c.draft,
        q = point(e);
      let action: string = c.action;
      if (c.located && c.action !== "place") {
        const rect = canvas.getBoundingClientRect();
        let best = 24;
        buildingHandles(b).forEach(([x, z], i) => {
          const v = new Vector3(x, (surface(x, z) ?? 0) + 1.3, z).project(
              camera,
            ),
            d = Math.hypot(
              rect.left + ((v.x + 1) * rect.width) / 2 - e.clientX,
              rect.top + ((1 - v.y) * rect.height) / 2 - e.clientY,
            );
          if (d < best) {
            best = d;
            action = ["move", "rotate", "resize"][i];
          }
        });
        if (best === 24 && (!q || !inside(q, footprint(b)))) return;
      }
      e.stopImmediatePropagation();
      e.preventDefault();
      canvas.setPointerCapture(e.pointerId);
      drag = {
        id: e.pointerId,
        x: e.clientX,
        y: e.clientY,
        point: q,
        building: structuredClone(b),
        action,
      };
    }
    function move(e: PointerEvent) {
      if (!drag || drag.id !== e.pointerId || drag.action === "place") return;
      e.stopImmediatePropagation();
      e.preventDefault();
      const q = point(e),
        d = drag,
        b = d.building;
      if (!q || !d.point) return;
      const c = useConstruction.getState();
      if (d.action === "move")
        c.locate([
          +(b.center[0] + q[0] - d.point[0]).toFixed(2),
          +(b.center[1] + q[1] - d.point[1]).toFixed(2),
        ]);
      else if (d.action === "rotate") {
        const delta =
          Math.atan2(q[1] - b.center[1], q[0] - b.center[0]) -
          Math.atan2(d.point[1] - b.center[1], d.point[0] - b.center[0]);
        c.patch({
          rotation:
            (((Math.round((b.rotation + (delta * 180) / Math.PI) / 5) * 5) %
              360) +
              360) %
            360,
        });
      } else if (d.action === "resize") {
        const angle = (-b.rotation * Math.PI) / 180,
          x = q[0] - b.center[0],
          z = q[1] - b.center[1];
        c.patch({
          width: Math.max(
            6,
            Math.min(
              30,
              Math.round(
                Math.abs(x * Math.cos(angle) - z * Math.sin(angle)) * 4,
              ) / 2,
            ),
          ),
          depth: Math.max(
            8,
            Math.min(
              30,
              Math.round(
                Math.abs(x * Math.sin(angle) + z * Math.cos(angle)) * 4,
              ) / 2,
            ),
          ),
        });
      }
      invalidate();
    }
    function finish(e: PointerEvent) {
      if (!drag || drag.id !== e.pointerId) return;
      e.stopImmediatePropagation();
      e.preventDefault();
      if (
        drag.action === "place" &&
        Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 12
      ) {
        const q = point(e);
        if (q) useConstruction.getState().locate(q);
        else
          useConstruction
            .getState()
            .feedback(
              "No verified land beneath the pointer. Water or missing terrain cannot receive construction.",
            );
      }
      cancel();
      invalidate();
    }
    function cancel() {
      if (drag && canvas.hasPointerCapture(drag.id))
        canvas.releasePointerCapture(drag.id);
      drag = null;
    }
    canvas.addEventListener("pointerdown", start, true);
    canvas.addEventListener("pointermove", move, true);
    canvas.addEventListener("pointerup", finish, true);
    canvas.addEventListener("pointercancel", cancel, true);
    return () => {
      cancel();
      material.dispose();
      canvas.removeEventListener("pointerdown", start, true);
      canvas.removeEventListener("pointermove", move, true);
      canvas.removeEventListener("pointerup", finish, true);
      canvas.removeEventListener("pointercancel", cancel, true);
    };
  }, [camera, gl, invalidate, surface, terrain]);
  return null;
}
