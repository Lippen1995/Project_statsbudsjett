import { useEffect, useMemo, useRef } from "react";
import { Canvas, useThree, type ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { useCity } from "../state/store";
import { installCapture } from "../geo/capture";
import type { Building, CityData, Road } from "../geo/types";
import {
  buildingGeometry,
  featureAtFace,
  makeBuildings,
  makeRoads,
  makeTerrain,
  makeWater,
  makeCoastalEdge,
  roadGeometry,
} from "../geo/geometry";
import TrafficOverlay from "./TrafficOverlay";
import { terrainSampler } from "../geo/surface";

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
    const stopCapture = installCapture(camera, gl, orbit, invalidate);
    return () => {
      stopCapture();
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
  const surface = useMemo(() => terrainSampler(data.terrain), [data]);
  const buildings = useMemo(
    () => makeBuildings(data, surface),
    [data, surface],
  );
  const roads = useMemo(() => makeRoads(data, surface), [data, surface]);
  const terrain = useMemo(() => makeTerrain(data), [data]);
  const coast = useMemo(() => makeCoastalEdge(data), [data]);
  const water = useMemo(() => makeWater(data), [data]);
  const highlight = useMemo(
    () =>
      selected?.kind === "building"
        ? buildingGeometry(selected as Building, surface)
        : selected?.kind === "road"
          ? roadGeometry(selected as Road, surface)
          : null,
    [selected, surface],
  );
  // Merged geometry keeps draw calls bounded; face ranges retain selection IDs.
  useEffect(
    () => () => {
      buildings.geometry.dispose();
      roads.geometry.dispose();
      terrain.dispose();
      coast.dispose();
      water.dispose();
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
  return (
    <>
      <mesh
        geometry={terrain}
        receiveShadow
        onClick={(e) => {
          if (e.delta < 4) select(null);
        }}
      >
        <meshLambertMaterial vertexColors side={THREE.DoubleSide} />
      </mesh>
      <mesh geometry={water} visible={layers.water}>
        <WaterMaterial />
      </mesh>
      <mesh geometry={coast} receiveShadow>
        <meshLambertMaterial vertexColors side={THREE.DoubleSide} />
      </mesh>
      <mesh
        visible={layers.buildings}
        geometry={buildings.geometry}
        castShadow
        onClick={(e) => pick(e, buildings)}
      >
        <meshLambertMaterial vertexColors />
      </mesh>
      <mesh
        visible={layers.roads}
        geometry={roads.geometry}
        onClick={(e) => pick(e, roads)}
      >
        <meshLambertMaterial vertexColors side={THREE.DoubleSide} />
      </mesh>
      <TrafficOverlay data={data} surface={surface} />
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

function WaterMaterial() {
  const material = useMemo(() => {
    const m = new THREE.MeshBasicMaterial({ vertexColors: true });
    // Static, world-space tonal ripples. Cheap triangle waves, no texture, PBR,
    // animated loop, reflection pass or bathymetry claim.
    m.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader
        .replace(
          "#include <common>",
          "#include <common>\nvarying vec2 waterWorld;",
        )
        .replace(
          "#include <begin_vertex>",
          "#include <begin_vertex>\nwaterWorld = (modelMatrix * vec4(transformed, 1.0)).xz;",
        );
      shader.fragmentShader = shader.fragmentShader
        .replace(
          "#include <common>",
          "#include <common>\nvarying vec2 waterWorld;",
        )
        .replace(
          "#include <color_fragment>",
          "#include <color_fragment>\nfloat broad = abs(fract(dot(waterWorld, vec2(0.012, 0.021))) * 2.0 - 1.0);\nfloat fine = abs(fract(dot(waterWorld, vec2(0.18, -0.11))) * 2.0 - 1.0);\ndiffuseColor.rgb *= 0.97 + 0.035 * broad + 0.015 * fine;",
        );
    };
    m.customProgramCacheKey = () => "bergen-static-water-v2";
    return m;
  }, []);
  useEffect(() => () => material.dispose(), [material]);
  return <primitive object={material} attach="material" />;
}

function StaticShadows() {
  const { gl, invalidate } = useThree();
  const layers = useCity((s) => s.layers);
  const quality = useCity((s) => s.quality);
  useEffect(() => {
    gl.shadowMap.autoUpdate = false;
    gl.shadowMap.needsUpdate = true;
    invalidate();
    return () => {
      gl.shadowMap.autoUpdate = true;
    };
  }, [gl, invalidate, layers, quality]);
  return null;
}

export default function Scene({ data }: { data: CityData }) {
  const quality = useCity((s) => s.quality);
  return (
    <Canvas
      frameloop="demand"
      shadows={quality === "balanced" ? "basic" : false}
      dpr={quality === "low" ? 1 : [1, 1.5]}
      camera={{ position: [1050, 1950, 2150], fov: 43, near: 2, far: 14000 }}
      gl={{
        antialias: quality !== "low",
        powerPreference: "low-power",
        alpha: false,
        toneMapping: THREE.ACESFilmicToneMapping,
        toneMappingExposure: 0.95,
      }}
      onPointerMissed={() => useCity.getState().select(null)}
      fallback={
        <div className="scene-error">
          WebGL is unavailable. Enable hardware acceleration to explore Bergen.
          The geographic data remains available in the sidebar.
        </div>
      }
    >
      <color attach="background" args={["#c2d3d6"]} />
      <fog attach="fog" args={["#c2d3d6", 2300, 7200]} />
      <hemisphereLight args={["#e3eff5", "#66756b", 1.25]} />
      <directionalLight
        position={[-1200, 2500, 1000]}
        intensity={2.1}
        color="#fff3dc"
        castShadow={quality === "balanced"}
        shadow-mapSize={[1024, 1024]}
        shadow-camera-left={-1900}
        shadow-camera-right={1900}
        shadow-camera-top={1900}
        shadow-camera-bottom={-1900}
        shadow-camera-near={10}
        shadow-camera-far={6500}
        shadow-bias={-0.0003}
        shadow-normalBias={1.5}
      />
      <CityGeometry data={data} />
      <CameraControls data={data} />
      <StaticShadows />
    </Canvas>
  );
}
