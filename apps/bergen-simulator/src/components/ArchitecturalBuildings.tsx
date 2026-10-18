import { useEffect, useRef, useState } from "react";
import { useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { MathUtils, Mesh, MeshLambertMaterial, DoubleSide } from "three";
import type { CityData } from "../geo/types";
import { architecturalLod } from "../architecture/model";
import { useArchitecture } from "../architecture/state";
import type { ArchitecturalTile } from "../architecture/load";
import { recordPreparation } from "../geo/diagnostics";

export function useArchitecturalTile(data: CityData, enabled: boolean) {
  // The known opening camera is in the pilot. Start during geography-worker
  // preparation, so a detailed first frame does not require a second cold pass.
  const [near, setNear] = useState(true),
    [tile, setTile] = useState<ArchitecturalTile | null>(null);
  useEffect(() => {
    if (!near || !enabled) {
      setTile(null);
      useArchitecture.setState({ status: "schematic" });
      return;
    }
    let disposed = false,
      owned: ArchitecturalTile | null = null;
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(new Error("Architectural asset deadline")),
      15000,
    );
    const start = performance.now();
    useArchitecture.setState({ status: "loading" });
    import("../architecture/load")
      .then(({ loadArchitecturalTile }) =>
        loadArchitecturalTile(data, controller.signal),
      )
      .then((result) => {
        if (disposed) {
          result.dispose();
          return;
        }
        owned = result;
        recordPreparation(
          "architecture.fetch-decode-batch",
          performance.now() - start,
        );
        setTile(result);
        useArchitecture.setState({ status: "ready" });
      })
      .catch(() => {
        if (!disposed) {
          setTile(null);
          useArchitecture.setState({ status: "unavailable" });
        }
      })
      .finally(() => clearTimeout(timeout));
    return () => {
      disposed = true;
      clearTimeout(timeout);
      controller.abort();
      owned?.dispose();
    };
  }, [near, enabled, data]);
  return { tile: near && enabled ? tile : null, near, setNear };
}

/** LOD observes existing demand frames; it never schedules an animation loop. */
export function ArchitecturalLod({
  enabled,
  near,
  setNear,
  tile,
}: {
  enabled: boolean;
  near: boolean;
  setNear: (near: boolean) => void;
  tile: ArchitecturalTile | null;
}) {
  const { gl, invalidate } = useThree();
  useFrame(({ camera }) => {
    const d = Math.hypot(
      camera.position.x,
      camera.position.y - 8,
      camera.position.z + 245,
    );
    const next = architecturalLod(d, near, enabled);
    if (next !== near) setNear(next);
  });
  useEffect(() => {
    gl.shadowMap.needsUpdate = true;
    invalidate();
  }, [gl, invalidate, tile]);
  return null;
}

export default function ArchitecturalBuildings({
  tile,
  pick,
}: {
  tile: ArchitecturalTile;
  pick: (
    event: ThreeEvent<MouseEvent>,
    group: ArchitecturalTile["body"],
  ) => void;
}) {
  const facade = useRef<Mesh>(null);
  useFrame(({ camera }) => {
    if (!facade.current) return;
    const d = Math.hypot(
      camera.position.x,
      camera.position.y - 8,
      camera.position.z + 245,
    );
    const opacity = 1 - MathUtils.smoothstep(d, 350, 480);
    facade.current.visible = opacity > 0;
    (facade.current.material as MeshLambertMaterial).opacity = opacity;
  });
  return (
    <>
      <mesh
        geometry={tile.body.geometry}
        castShadow
          onClick={(e) => pick(e, tile.body)}
      >
        <meshLambertMaterial vertexColors side={DoubleSide} />
      </mesh>
      <mesh
        ref={facade}
        geometry={tile.facade.geometry}
          onClick={(e) => pick(e, tile.facade)}
      >
        <meshLambertMaterial
          map={tile.texture}
          side={DoubleSide}
          transparent
          forceSinglePass
          depthWrite={false}
          polygonOffset
          polygonOffsetFactor={-1}
          polygonOffsetUnits={-1}
        />
      </mesh>
    </>
  );
}
