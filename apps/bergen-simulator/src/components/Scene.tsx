import { useEffect, useMemo, useRef } from "react";
import { Canvas, useThree, type ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { useCity } from "../state/store";
import type { Building, CityData, Road } from "../geo/types";
import {
  buildingGeometry,
  featureAtFace,
  makeBuildings,
  makeRoads,
  makeTerrain,
  polygonShape,
  roadGeometry,
} from "../geo/geometry";

function CameraControls({ data }: { data: CityData }) {
  const { camera, gl, invalidate } = useThree();
  const command = useCity((s) => s.camera);
  const controls = useRef<OrbitControls | null>(null);
  useEffect(() => {
    const orbit = new OrbitControls(camera, gl.domElement);
    controls.current = orbit;
    orbit.enableDamping = false;
    orbit.minDistance = 65;
    orbit.maxDistance = 6200;
    orbit.maxPolarAngle = Math.PI / 2.12;
    orbit.zoomSpeed = 0.8;
    orbit.screenSpacePanning = false;
    const onChange = () => {
      const [west, north, east, south] = data.extent;
      const next = orbit.target.clone();
      next.x = THREE.MathUtils.clamp(next.x, west, east);
      next.z = THREE.MathUtils.clamp(next.z, north, south);
      next.y = THREE.MathUtils.clamp(next.y, 0, 550);
      camera.position.add(next.clone().sub(orbit.target));
      orbit.target.copy(next);
      invalidate();
    };
    orbit.addEventListener("change", onChange);
    return () => {
      orbit.dispose();
      controls.current = null;
    };
  }, [camera, gl, invalidate, data.extent]);
  useEffect(() => {
    const orbit = controls.current;
    if (!orbit) return;
    const [x, z] = command.point ?? [0, 0];
    const feature = command.point
      ? [...data.landmarks, ...data.buildings].find(
          (f) => f.center[0] === x && f.center[1] === z,
        )
      : null;
    const y = feature?.elevation ?? 0;
    orbit.target.set(x, y, z);
    camera.position.set(
      x + (command.point ? 230 : 1050),
      y + (command.point ? 310 : 1950),
      z + (command.point ? 450 : 2150),
    );
    orbit.update();
    invalidate();
  }, [camera, command, data, invalidate]);
  useEffect(() => {
    const canvas = gl.domElement;
    const onKey = (event: KeyboardEvent) => {
      const orbit = controls.current;
      if (!orbit) return;
      const direction = new THREE.Vector3().subVectors(
        camera.position,
        orbit.target,
      );
      let handled = true;
      if (event.key === "+" || event.key === "=")
        camera.position.copy(orbit.target).add(direction.multiplyScalar(0.85));
      else if (event.key === "-")
        camera.position.copy(orbit.target).add(direction.multiplyScalar(1.15));
      else if (event.key.toLowerCase() === "r") useCity.getState().focus(null);
      else if (event.key === "Escape") useCity.getState().select(null);
      else if (
        ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)
      ) {
        const delta = new THREE.Vector3(
          event.key === "ArrowLeft" ? -60 : event.key === "ArrowRight" ? 60 : 0,
          0,
          event.key === "ArrowUp" ? -60 : event.key === "ArrowDown" ? 60 : 0,
        );
        orbit.target.add(delta);
        camera.position.add(delta);
      } else handled = false;
      if (handled) {
        event.preventDefault();
        orbit.update();
        invalidate();
      }
    };
    canvas.tabIndex = 0;
    canvas.setAttribute("role", "img");
    canvas.setAttribute(
      "aria-label",
      "Interactive 3D map of central Bergen. Arrow keys pan, plus and minus zoom, R resets, Escape clears selection.",
    );
    canvas.addEventListener("keydown", onKey);
    return () => canvas.removeEventListener("keydown", onKey);
  }, [camera, gl, invalidate]);
  return null;
}

function CityGeometry({ data }: { data: CityData }) {
  const layers = useCity((s) => s.layers);
  const select = useCity((s) => s.select);
  const selected = useCity((s) => s.selected);
  const buildings = useMemo(() => makeBuildings(data), [data]);
  const roads = useMemo(() => makeRoads(data), [data]);
  const terrain = useMemo(() => makeTerrain(data), [data]);
  const coast = useMemo(() => {
    const positions = data.coastline.flatMap((line) =>
      line
        .slice(1)
        .flatMap((p, i) => [line[i][0], 1, line[i][1], p[0], 1, p[1]]),
    );
    return new THREE.BufferGeometry().setAttribute(
      "position",
      new THREE.Float32BufferAttribute(positions, 3),
    );
  }, [data]);
  const water = useMemo(
    () =>
      data.water.map((w) => {
        const geometry = new THREE.ShapeGeometry(polygonShape(w.rings));
        geometry.rotateX(-Math.PI / 2);
        geometry.translate(0, w.elevation + 0.5, 0);
        return geometry;
      }),
    [data],
  );
  const highlight = useMemo(
    () =>
      selected?.kind === "building"
        ? buildingGeometry(selected as Building)
        : selected?.kind === "road"
          ? roadGeometry(selected as Road)
          : null,
    [selected],
  );
  // Merged geometry keeps draw calls bounded; face ranges retain selection IDs.
  useEffect(
    () => () => {
      buildings.geometry.dispose();
      roads.geometry.dispose();
      terrain.dispose();
      coast.dispose();
      water.forEach((g) => g.dispose());
    },
    [buildings, roads, terrain, coast, water],
  );
  useEffect(
    () => () => {
      highlight?.dispose();
    },
    [highlight],
  );
  const pick = (event: ThreeEvent<MouseEvent>, group: typeof buildings) => {
    if (event.delta > 4 || event.faceIndex == null) return;
    event.stopPropagation();
    select(featureAtFace(group.ranges, event.faceIndex));
  };
  const [west, north, east, south] = data.extent;
  return (
    <>
      <mesh
        geometry={terrain}
        onClick={(e) => {
          if (e.delta < 4) select(null);
        }}
      >
        <meshStandardMaterial
          vertexColors
          roughness={0.95}
          side={THREE.DoubleSide}
        />
      </mesh>
      <group visible={layers.water}>
        <mesh
          rotation={[-Math.PI / 2, 0, 0]}
          position={[(west + east) / 2, -0.6, (north + south) / 2]}
        >
          <planeGeometry args={[east - west, south - north]} />
          <meshStandardMaterial
            color="#6c9fab"
            roughness={0.55}
            metalness={0.12}
          />
        </mesh>
        {water.map((geometry, i) => (
          <mesh key={i} geometry={geometry}>
            <meshStandardMaterial
              color="#6c9fab"
              roughness={0.55}
              side={THREE.DoubleSide}
            />
          </mesh>
        ))}
      </group>
      <lineSegments geometry={coast}>
        <lineBasicMaterial color="#d8e4d1" />
      </lineSegments>
      <mesh
        visible={layers.buildings}
        geometry={buildings.geometry}
        onClick={(e) => pick(e, buildings)}
      >
        <meshStandardMaterial vertexColors roughness={0.9} />
      </mesh>
      <mesh
        visible={layers.roads}
        geometry={roads.geometry}
        onClick={(e) => pick(e, roads)}
      >
        <meshBasicMaterial color="#e7e4d5" side={THREE.DoubleSide} />
      </mesh>
      {highlight ? (
        <mesh geometry={highlight} renderOrder={3}>
          <meshBasicMaterial
            color="#f1c65b"
            transparent
            opacity={0.85}
            depthTest={false}
            side={THREE.DoubleSide}
          />
        </mesh>
      ) : null}
      {selected ? (
        <mesh
          position={[
            selected.center[0],
            selected.elevation +
              (selected.kind === "building"
                ? ((selected as Building).height ?? 0)
                : 0) +
              14,
            selected.center[1],
          ]}
        >
          <sphereGeometry args={[7, 10, 8]} />
          <meshBasicMaterial color="#f6d673" />
        </mesh>
      ) : null}
    </>
  );
}

export default function Scene({ data }: { data: CityData }) {
  const quality = useCity((s) => s.quality);
  return (
    <Canvas
      frameloop="demand"
      dpr={quality === "low" ? 1 : [1, 1.5]}
      camera={{ position: [1050, 1950, 2150], fov: 43, near: 2, far: 14000 }}
      gl={{
        antialias: quality !== "low",
        powerPreference: "low-power",
        alpha: false,
      }}
      onPointerMissed={() => useCity.getState().select(null)}
      fallback={
        <div className="scene-error">
          WebGL is unavailable. Enable hardware acceleration to explore Bergen.
          The geographic data remains available in the sidebar.
        </div>
      }
    >
      <color attach="background" args={["#dbe4df"]} />
      <hemisphereLight args={["#fbf5e3", "#859d8e", 2.1]} />
      <directionalLight
        position={[-1500, 3000, 1200]}
        intensity={2.5}
        color="#fff3dc"
      />
      <CityGeometry data={data} />
      <CameraControls data={data} />
    </Canvas>
  );
}
