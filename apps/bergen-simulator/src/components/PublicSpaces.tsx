import { useEffect, useMemo, useRef } from "react";
import { useThree, type ThreeEvent } from "@react-three/fiber";
import {
  BufferGeometry,
  Color,
  DoubleSide,
  Float32BufferAttribute,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  Raycaster,
  Vector2,
  Vector3,
} from "three";
import type { Point, Point3 } from "../geo/types";
import type { SurfaceSampler } from "../geo/surface";
import { useScenario } from "../state/scenario";
import { usePhysical } from "../state/physical";
import { placement } from "../physical/model";

function geometry(positions: number[], colors?: number[], normals = false) {
  const g = new BufferGeometry();
  g.setAttribute("position", new Float32BufferAttribute(positions, 3));
  if (colors) g.setAttribute("color", new Float32BufferAttribute(colors, 3));
  if (normals) g.computeVertexNormals();
  return g;
}
/** At most two merged passes, plus one bounded instanced handle pass while editing. */
const EMPTY: never[] = [];
export default function PublicSpaces({
  surface,
  terrain,
}: {
  surface: SurfaceSampler;
  terrain: BufferGeometry;
}) {
  const s = useScenario(),
    p = usePhysical(),
    handles = useRef<InstancedMesh>(null);
  const spaces =
    s.mapView === "baseline"
      ? EMPTY
      : s.mapView === "reference"
        ? (s.library.find((v) => v.id === s.referenceId)?.scenario.physical
            ?.proposals ?? EMPTY)
        : (s.physical?.proposals ?? EMPTY);
  const batch = useMemo(() => {
    const positions: number[] = [],
      colors: number[] = [],
      lines: number[] = [],
      lineColors: number[] = [],
      ranges: { end: number; id: string }[] = [];
    if (!s.context)
      return { surface: geometry([]), boundary: geometry([]), ranges };
    const draft = s.mapView === "plan" ? p.draft : null;
    const visible = [
      ...spaces.filter((v) => v.id !== draft?.id),
      ...(draft ? [draft] : []),
    ];
    for (const space of visible) {
      const check = placement(space, s.context, visible),
        isDraft = space === draft,
        selected = space.id === p.selectedId;
      const color = new Color(
          isDraft && !check.valid
            ? "#d97964"
            : space.kind === "landscaped"
              ? "#86a67e"
              : "#dac68d",
        ),
        edge = new Color(
          isDraft && !check.valid
            ? "#ff9987"
            : selected || isDraft
              ? "#fff2cc"
              : "#e2b967",
        );
      for (const triangle of check.triangles)
        for (const [x, y, z] of triangle) {
          positions.push(x, y + 0.22, z);
          colors.push(color.r, color.g, color.b);
        }
      ranges.push({ end: positions.length / 9, id: space.id });
      const ring = space.vertices;
      for (let i = 0; i < ring.length; i++) {
        if (ring.length < 3 && i === ring.length - 1) break;
        const a = ring[i],
          b = ring[(i + 1) % ring.length],
          length = Math.hypot(b[0] - a[0], b[1] - a[1]),
          steps = Math.max(1, Math.ceil(length / 2));
        // Import bounds keep this finite; unapplied inputs are bounded again here.
        if (!Number.isFinite(length) || length > 150) continue;
        for (let k = 0; k < steps; k++) {
          if (!isDraft && k % 3 === 2) continue; // Dashed: proposed, never a surveyed boundary.
          const pair: Point3[] = [];
          for (const t of [k / steps, (k + 1) / steps]) {
            const x = a[0] + t * (b[0] - a[0]),
              z = a[1] + t * (b[1] - a[1]),
              y = surface(x, z);
            if (y !== null) pair.push([x, y + 0.36, z]);
          }
          if (pair.length === 2) {
            lines.push(...pair.flat());
            for (let j = 0; j < 2; j++) lineColors.push(edge.r, edge.g, edge.b);
          }
        }
      }
    }
    return {
      surface: geometry(positions, colors, true),
      boundary: geometry(lines, lineColors),
      ranges,
    };
  }, [s.context, s.mapView, spaces, p.draft, p.selectedId, surface]);
  useEffect(
    () => () => {
      batch.surface.dispose();
      batch.boundary.dispose();
    },
    [batch],
  );
  const draft = s.mapView === "plan" ? p.draft : null;
  useEffect(() => {
    const mesh = handles.current;
    if (!mesh) return;
    const matrix = new Matrix4();
    let count = 0;
    for (const [x, z] of draft?.vertices ?? []) {
      const y = surface(x, z);
      if (y === null) continue;
      matrix.makeTranslation(x, y + 1.2, z);
      mesh.setMatrixAt(count++, matrix);
    }
    mesh.count = count;
    mesh.instanceMatrix.needsUpdate = true;
  }, [draft, surface]);
  function select(event: ThreeEvent<MouseEvent>) {
    if (p.draft || event.delta > 4 || event.faceIndex == null) return;
    const space = batch.ranges.find((r) => event.faceIndex! < r.end);
    if (space) {
      event.stopPropagation();
      if (s.mapView !== "plan") {
        p.feedback("Comparison view. Show your current design to edit it.");
        return;
      }
      p.select(space.id);
    }
  }
  return (
    <>
      {s.context && batch.surface.getAttribute("position").count > 0 && (
        <mesh geometry={batch.surface} renderOrder={3} onClick={select}>
          <meshLambertMaterial
            vertexColors
            side={DoubleSide}
            polygonOffset
            polygonOffsetFactor={-2}
            polygonOffsetUnits={-2}
          />
        </mesh>
      )}
      {s.context && batch.boundary.getAttribute("position").count > 0 && (
        <lineSegments geometry={batch.boundary} renderOrder={4}>
          <lineBasicMaterial vertexColors toneMapped={false} />
        </lineSegments>
      )}
      {draft && (
        <instancedMesh
          ref={handles}
          args={[undefined, undefined, 8]}
          count={0}
          renderOrder={5}
          frustumCulled={false}
        >
          <sphereGeometry args={[1.4, 8, 6]} />
          <meshBasicMaterial color="#fff5cf" depthTest={false} />
        </instancedMesh>
      )}
      <PhysicalPointer terrain={terrain} surface={surface} />
    </>
  );
}
function PhysicalPointer({
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
    let down: { x: number; y: number; vertex: number; id: number } | null =
      null;
    const point = (event: PointerEvent): Point | null => {
      const rect = canvas.getBoundingClientRect();
      ndc.set(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        (-(event.clientY - rect.top) / rect.height) * 2 + 1,
      );
      ray.setFromCamera(ndc, camera);
      const hit = ray.intersectObject(mesh, false)[0];
      return hit ? [+hit.point.x.toFixed(2), +hit.point.z.toFixed(2)] : null;
    };
    const nearest = (event: PointerEvent) => {
      const d = usePhysical.getState().draft,
        rect = canvas.getBoundingClientRect();
      let index = -1,
        best = 24;
      d?.vertices.forEach(([x, z], i) => {
        const y = surface(x, z);
        if (y === null) return;
        const v = new Vector3(x, y + 1.2, z).project(camera),
          sx = rect.left + ((v.x + 1) * rect.width) / 2,
          sy = rect.top + ((1 - v.y) * rect.height) / 2,
          dist = Math.hypot(sx - event.clientX, sy - event.clientY);
        if (dist < best) {
          best = dist;
          index = i;
        }
      });
      return index;
    };
    const start = (event: PointerEvent) => {
      const p = usePhysical.getState();
      if (
        p.mode !== "spaces" ||
        p.action === "navigate" ||
        !p.draft ||
        event.button !== 0 ||
        down
      )
        return;
      event.stopImmediatePropagation();
      event.preventDefault();
      const vertex = p.action === "reshape" ? nearest(event) : -1;
      down = {
        x: event.clientX,
        y: event.clientY,
        vertex,
        id: event.pointerId,
      };
      canvas.setPointerCapture(event.pointerId);
      if (vertex >= 0) p.setVertex(vertex);
    };
    const move = (event: PointerEvent) => {
      if (!down || event.pointerId !== down.id || down.vertex < 0) return;
      event.stopImmediatePropagation();
      event.preventDefault();
      const q = point(event);
      if (q) {
        usePhysical.getState().move(down.vertex, q);
        invalidate();
      }
    };
    const finish = (event: PointerEvent) => {
      if (!down || event.pointerId !== down.id) return;
      event.stopImmediatePropagation();
      event.preventDefault();
      if (
        usePhysical.getState().action === "draw" &&
        Math.hypot(event.clientX - down.x, event.clientY - down.y) < 12
      ) {
        const q = point(event);
        if (q) usePhysical.getState().add(q);
        else
          usePhysical
            .getState()
            .feedback(
              "No mapped land beneath this point. Water and missing terrain cannot receive a surface.",
            );
      }
      if (canvas.hasPointerCapture(event.pointerId))
        canvas.releasePointerCapture(event.pointerId);
      down = null;
      invalidate();
    };
    const cancel = () => {
      if (down && canvas.hasPointerCapture(down.id))
        canvas.releasePointerCapture(down.id);
      down = null;
    };
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
