import ArchitecturalBuildings, {
  useArchitecturalTile,
  ArchitecturalLod,
} from "./ArchitecturalBuildings";
import type { ArchitecturalTile } from "../architecture/load";
import type { EnhancementTile } from "../enhancements/load";
import { withoutEnhancements } from "../enhancements/model";
import { useEnhancementTile, EnhancementShadows } from "./EnhancedBuildings";
import {
  clearInspectionPosition,
  LANDMARK_VIEWS,
} from "../architecture/inspection";
import { catalogue, fallbackWithoutAssets } from "../architecture/model";
import ProposedAccess from "./ProposedAccess";
import { useAccess } from "../state/access";
import { startCityPreparation } from "../geo/preparation-client";
import type { PreparedCity } from "../geo/preparation";
import { preparation } from "../geo/diagnostics";
import { useConstruction } from "../state/construction";
import ProposedBuildings from "./ProposedBuildings";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Canvas,
  useFrame,
  useThree,
  type ThreeEvent,
} from "@react-three/fiber";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { useScenario } from "../state/scenario";
import { nearestSegment } from "../simulation/interventions";
import { useCity } from "../state/store";
import { installCapture } from "../geo/capture";
import type { Building, CityData, Road } from "../geo/types";
import { buildingGeometry, featureAtFace, roadGeometry } from "../geo/geometry";
import TrafficOverlay from "./TrafficOverlay";
import PublicSpaces from "./PublicSpaces";
import { usePhysical } from "../state/physical";
import { terrainSampler } from "../geo/surface";
import {
  BENCHMARK_VIEWS,
  heroShadow,
  inspectionCamera,
} from "../geo/benchmark";
import { SourceBuildingMaterial, WaterMaterial } from "./CityMaterials";

function CameraControls({ data }: { data: CityData }) {
  const { camera, gl, invalidate, scene } = useThree();
  const command = useCity((s) => s.camera);
  const planning = useScenario((s) => s.phase !== "closed");
  useEffect(() => {
    if (planning && useCity.getState().camera.landmark)
      useCity.getState().focus(null);
  }, [planning]);
  const editing = usePhysical(
    (s) => s.mode === "spaces" && s.action !== "navigate",
  );
  const constructing = useConstruction(
    (s) => !!s.draft && s.action !== "navigate",
  );
  const buildingMode = usePhysical((s) => s.mode === "buildings");
  const accessDrawing = useAccess((a) => a.drawing);
  const accessMode = usePhysical((p) => p.mode === "access");
  const controls = useRef<OrbitControls | null>(null);
  const street = useRef(false);
  const flight = useRef<{
    started: number;
    from: THREE.Vector3;
    fromTarget: THREE.Vector3;
    position: THREE.Vector3;
    target: THREE.Vector3;
    height: number;
  } | null>(null);
  const ground = useRef<ReturnType<typeof terrainSampler> | null>(null);
  const obstacles = useMemo(
    () =>
      data.buildings.filter(
        (b) => Math.hypot(b.center[0] - 51.24, b.center[1] + 142.25) < 140,
      ),
    [data],
  );
  useFrame(() => {
    const f = flight.current,
      orbit = controls.current;
    if (!f || !orbit) return;
    const t = Math.min(1, (performance.now() - f.started) / 1800);
    const smooth = (x: number) => x * x * (3 - 2 * x);
    // Fly above the bounded city first, translate overhead, then descend at an
    // already-cleared exterior viewpoint; never interpolate through the landmark.
    if (t < 0.25)
      camera.position
        .copy(f.from)
        .lerp(
          new THREE.Vector3(f.from.x, f.height, f.from.z),
          smooth(t / 0.25),
        );
    else if (t < 0.65)
      camera.position.set(
        THREE.MathUtils.lerp(f.from.x, f.position.x, smooth((t - 0.25) / 0.4)),
        f.height,
        THREE.MathUtils.lerp(f.from.z, f.position.z, smooth((t - 0.25) / 0.4)),
      );
    else
      camera.position.set(
        f.position.x,
        THREE.MathUtils.lerp(f.height, f.position.y, smooth((t - 0.65) / 0.35)),
        f.position.z,
      );
    orbit.target.copy(f.fromTarget).lerp(f.target, smooth(t));
    if (t === 1) {
      flight.current = null;
      orbit.minDistance = 3.5;
      orbit.maxDistance = 90;
      orbit.enabled = true;
    }
    orbit.update();
    invalidate();
  });
  useEffect(() => {
    const orbit = new OrbitControls(camera, gl.domElement);
    controls.current = orbit;
    orbit.enableDamping = false;
    orbit.minDistance = 18;
    orbit.maxDistance = 6200;
    orbit.maxPolarAngle = Math.PI / 2.12;
    orbit.zoomSpeed = 0.8;
    orbit.screenSpacePanning = false;
    const onChange = () => {
      if (street.current && !flight.current) {
        const p = camera.position;
        const corrected = clearInspectionPosition(
          p.toArray() as [number, number, number],
          ground.current?.(p.x, p.z) ?? null,
          obstacles,
        );
        camera.position.fromArray(corrected);
        camera.lookAt(orbit.target);
      }
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
    const stopCapture = installCapture(camera, gl, orbit, invalidate, scene);
    return () => {
      stopCapture();
      orbit.dispose();
      controls.current = null;
    };
  }, [camera, gl, invalidate, data.extent, scene, obstacles]);
  useEffect(() => {
    if (controls.current)
      controls.current.enabled =
        !editing &&
        !(constructing && buildingMode) &&
        !(accessDrawing && accessMode);
  }, [editing, constructing, buildingMode, accessDrawing, accessMode]);
  useEffect(() => {
    const orbit = controls.current;
    if (!orbit) return;
    flight.current = null;
    street.current = !!command.landmark;
    orbit.enablePan = !command.landmark;
    orbit.minDistance = command.landmark ? 3.5 : 18;
    orbit.maxDistance = command.landmark ? 90 : 6200;
    orbit.maxPolarAngle = command.landmark ? Math.PI / 2 : Math.PI / 2.12;
    orbit.enabled = true;
    if (command.landmark) {
      ground.current ??= terrainSampler(data.terrain);
      const v = LANDMARK_VIEWS.find((v) => v.id === command.landmark)!;
      const position = new THREE.Vector3(
        ...clearInspectionPosition(
          [...v.position],
          ground.current(v.position[0], v.position[2]),
          obstacles,
        ),
      );
      const target = new THREE.Vector3(...v.target);
      if (
        command.immediate ||
        matchMedia("(prefers-reduced-motion: reduce)").matches
      ) {
        camera.position.copy(position);
        orbit.target.copy(target);
        orbit.update();
      } else {
        flight.current = {
          started: performance.now(),
          from: camera.position.clone(),
          fromTarget: orbit.target.clone(),
          position,
          target,
          height: Math.max(100, camera.position.y),
        };
        orbit.minDistance = 1;
        orbit.maxDistance = 6200;
        orbit.enabled = false;
      }
      invalidate();
      return;
    }
    const view = BENCHMARK_VIEWS.find((v) => v.id === command.view);
    const selected = command.object
      ? [...data.buildings, ...data.roads, ...data.landmarks].find(
          (f) => f.id === command.object,
        )
      : undefined;
    const renderAsset = catalogue.buildings.find((b) => b.id === selected?.id);
    const inspected =
      selected?.kind === "building" && renderAsset
        ? ({
            ...selected,
            height: renderAsset.roof.ridgeNN2000 - selected.elevation,
          } as Building)
        : selected;
    const pose = view ?? (inspected ? inspectionCamera(inspected, data) : null);
    if (pose) {
      orbit.target.fromArray(pose.target);
      camera.position.fromArray(pose.position);
      orbit.update();
      invalidate();
      return;
    }
    const [x, z] = command.point ?? [0, 0];
    const feature = command.point
      ? [...data.landmarks, ...data.buildings].find(
          (f) => f.center[0] === x && f.center[1] === z,
        )
      : null;
    const y = feature?.elevation ?? 0;
    orbit.target.set(x, y, z);
    camera.position.set(
      x + (command.close ? 45 : command.point ? 230 : 1050),
      y + (command.close ? 105 : command.point ? 310 : 1950),
      z + (command.close ? 110 : command.point ? 450 : 2150),
    );
    orbit.update();
    invalidate();
  }, [camera, command, data, invalidate, obstacles]);
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
      else if (event.key === "Escape") {
        if (flight.current) {
          // Escape skips to the cleared destination rather than stranding a
          // street camera around an intermediate aerial target.
          camera.position.copy(flight.current.position);
          orbit.target.copy(flight.current.target);
          flight.current = null;
          orbit.enabled = true;
          orbit.maxDistance = 90;
          orbit.minDistance = 3.5;
        } else useCity.getState().select(null);
      } else if (
        ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)
      ) {
        if (street.current) {
          direction.applyAxisAngle(
            new THREE.Vector3(0, 1, 0),
            event.key === "ArrowLeft"
              ? -0.12
              : event.key === "ArrowRight"
                ? 0.12
                : 0,
          );
          if (event.key === "ArrowUp") direction.y += 1;
          if (event.key === "ArrowDown") direction.y -= 1;
          camera.position.copy(orbit.target).add(direction);
          event.preventDefault();
          orbit.update();
          invalidate();
          return;
        }
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
      "Interactive 3D map of central Bergen. Arrow keys pan, plus and minus zoom, R resets, Escape skips movement or clears selection.",
    );
    canvas.addEventListener("keydown", onKey);
    return () => canvas.removeEventListener("keydown", onKey);
  }, [camera, gl, invalidate]);
  return null;
}

function CityGeometry({
  data,
  prepared,
  architecture,
  enhancement,
}: {
  data: CityData;
  prepared: PreparedCity;
  architecture: ArchitecturalTile | null;
  enhancement: EnhancementTile | null;
}) {
  const layers = useCity((s) => s.layers);
  const select = useCity((s) => s.select);
  const selected = useCity((s) => s.selected);
  const selectedSegmentId = useCity((s) => s.selectedSegmentId);
  const quality = useCity((s) => s.quality);
  const surface = useMemo(
    () => preparation("terrain.index", () => terrainSampler(data.terrain)),
    [data],
  );
  const { buildings, roads, terrain, coast, water } = prepared;
  const filtered = useMemo(
    () =>
      preparation("architecture.fallback-index", () =>
        fallbackWithoutAssets(buildings),
      ),
    [buildings],
  );
  useEffect(() => () => filtered.geometry.dispose(), [filtered]);
  const originalBuildings = architecture ? filtered : buildings;
  const enhancedFallback = useMemo(
    () =>
      enhancement
        ? preparation("public-geodata.fallback-index", () =>
            withoutEnhancements(originalBuildings),
          )
        : null,
    [enhancement, originalBuildings],
  );
  useEffect(
    () => () => enhancedFallback?.geometry.dispose(),
    [enhancedFallback],
  );
  const visibleBuildings = enhancedFallback ?? originalBuildings;
  const highlight = useMemo(() => {
    if (selected?.kind === "building") {
      // Ground perimeter keeps selection legible without x-raying internal LOD
      // edges across the architecture being inspected.
      if (
        selected.id === "way/393025479" ||
        enhancement?.ranges.some((r) => r.feature.id === selected.id)
      ) {
        const b = selected as Building;
        const points: number[] = [];
        for (let i = 0; i < b.rings[0].length - 1; i++)
          for (const [x, z] of [b.rings[0][i], b.rings[0][i + 1]])
            points.push(x, (surface(x, z) ?? b.elevation) + 0.1, z);
        return new THREE.BufferGeometry().setAttribute(
          "position",
          new THREE.Float32BufferAttribute(points, 3),
        );
      }
      const assetRange =
        architecture?.body.ranges.findIndex(
          (r) => r.feature.id === selected.id,
        ) ?? -1;
      let body: THREE.BufferGeometry;
      if (architecture && assetRange >= 0) {
        const start = assetRange
          ? architecture.body.ranges[assetRange - 1].end
          : 0;
        const end = architecture.body.ranges[assetRange].end;
        const positions = architecture.body.geometry
          .getAttribute("position")
          .array.slice(start * 9, end * 9);
        body = new THREE.BufferGeometry().setAttribute(
          "position",
          new THREE.BufferAttribute(positions, 3),
        );
      } else body = buildingGeometry(selected as Building, surface);
      const edges = new THREE.EdgesGeometry(body, 25);
      body.dispose();
      return edges;
    }
    return selected?.kind === "road" && !selectedSegmentId
      ? roadGeometry(selected as Road, surface)
      : null;
  }, [selected, selectedSegmentId, surface, architecture, enhancement]);
  // Static batches are owned/disposed by the preparation worker client.
  useEffect(
    () => () => {
      highlight?.dispose();
    },
    [highlight],
  );
  const pick = (event: ThreeEvent<MouseEvent>, group: typeof buildings) => {
    if (
      usePhysical.getState().draft ||
      useConstruction.getState().draft ||
      event.delta > 4 ||
      event.faceIndex == null
    )
      return;
    event.stopPropagation();
    const feature = featureAtFace(group.ranges, event.faceIndex);
    const network = useScenario.getState().network;
    const section =
      network && feature?.kind === "road"
        ? nearestSegment(network, feature.id, [event.point.x, event.point.z])
        : null;
    select(feature, section);
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
        <WaterMaterial detail={quality === "balanced"} />
      </mesh>
      <mesh geometry={coast} receiveShadow>
        <meshLambertMaterial vertexColors side={THREE.DoubleSide} />
      </mesh>
      <mesh
        visible={layers.buildings}
        geometry={visibleBuildings.geometry}
        castShadow
        onClick={(e) => pick(e, visibleBuildings)}
      >
        <SourceBuildingMaterial detail={quality === "balanced"} />
      </mesh>
      {architecture ? (
        <ArchitecturalBuildings tile={architecture} pick={pick} />
      ) : null}
      {enhancement ? (
        <mesh
          geometry={enhancement.geometry}
          castShadow
          onClick={(e) => pick(e, enhancement)}
        >
          <meshLambertMaterial vertexColors side={THREE.DoubleSide} />
        </mesh>
      ) : null}
      <RoofAccents
        geometry={prepared.roofEdges}
        enabled={layers.buildings && quality === "balanced" && !architecture}
      />
      <mesh
        visible={layers.roads}
        geometry={roads.geometry}
        onClick={(e) => pick(e, roads)}
      >
        <meshLambertMaterial vertexColors side={THREE.DoubleSide} />
      </mesh>
      <TrafficOverlay data={data} surface={surface} />
      <PublicSpaces terrain={terrain} surface={surface} />
      <ProposedBuildings terrain={terrain} surface={surface} />
      <ProposedAccess terrain={terrain} surface={surface} />
      {highlight && selected?.kind === "building" ? (
        <lineSegments geometry={highlight} renderOrder={3}>
          <lineBasicMaterial
            color="#e9b94f"
            transparent
            opacity={0.9}
            depthTest={false}
          />
        </lineSegments>
      ) : highlight ? (
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
      {selected && selected.kind !== "building" && !selectedSegmentId ? (
        <mesh
          position={[
            selected.center[0],
            selected.elevation + 14,
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

function RoofAccents({
  geometry,
  enabled,
}: {
  geometry: THREE.BufferGeometry;
  enabled: boolean;
}) {
  const ref = useRef<THREE.LineSegments>(null);
  useFrame(({ camera }) => {
    if (!ref.current) return;
    const d = Math.hypot(
      camera.position.x,
      camera.position.y - 8,
      camera.position.z + 250,
    );
    const visible = enabled && d < 900;
    if (ref.current.visible && !visible) geometry.dispose();
    ref.current.visible = visible;
    (ref.current.material as THREE.LineBasicMaterial).opacity =
      0.42 * (1 - THREE.MathUtils.smoothstep(d, 420, 900));
  });
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <lineSegments
      ref={ref}
      geometry={geometry}
      visible={false}
      raycast={() => {}}
    >
      <lineBasicMaterial
        vertexColors
        transparent
        opacity={0.42}
        depthWrite={false}
      />
    </lineSegments>
  );
}

function SunLight({ enabled }: { enabled: boolean }) {
  const ref = useRef<THREE.DirectionalLight>(null);
  const close = useRef<boolean | null>(null);
  const direction = useRef(new THREE.Vector3());
  // Called only on demand-rendered frames. Refit once at each shadow LOD
  // transition; ordinary orbit input reuses the already rendered shadow map.
  useFrame(({ camera, gl }) => {
    const light = ref.current,
      hero = heroShadow(
        camera.position,
        camera.getWorldDirection(direction.current),
      );
    if (!light || close.current === hero) return;
    close.current = hero;
    const z = hero ? -245 : 0,
      radius = hero ? 330 : 1900;
    light.target.position.set(0, 0, z);
    light.target.updateMatrixWorld();
    light.position.set(-1200, 2500, 1000 + z);
    const c = light.shadow.camera;
    c.left = -radius;
    c.right = radius;
    c.top = radius;
    c.bottom = -radius;
    c.updateProjectionMatrix();
    light.shadow.normalBias = hero ? 0.3 : 1.5;
    light.shadow.bias = hero ? -0.00006 : -0.0003;
    light.shadow.needsUpdate = true;
    gl.shadowMap.needsUpdate = true;
  });
  return (
    <directionalLight
      ref={ref}
      position={[-1200, 2500, 1000]}
      intensity={2.1}
      color="#fff1db"
      castShadow={enabled}
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
  );
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
  const buildingsEnabled = useCity((s) => s.layers.buildings);
  const architectural = useArchitecturalTile(
    data,
    buildingsEnabled && quality === "balanced",
  );
  const enhancement = useEnhancementTile(
    data,
    buildingsEnabled && quality === "balanced" && architectural.near,
  );
  const [prepared, setPrepared] = useState<{
    source: CityData;
    city: PreparedCity;
  } | null>(null);
  const [error, setError] = useState("");
  useEffect(
    () =>
      startCityPreparation(
        data,
        (city) => setPrepared({ source: data, city }),
        setError,
      ),
    [data],
  );
  if (error) throw new Error(error);
  if (prepared?.source !== data)
    return (
      <div className="scene-loading" role="status">
        Preparing verified Bergen geometry…
      </div>
    );
  return (
    <Canvas
      frameloop="demand"
      shadows={quality === "balanced" ? "basic" : false}
      dpr={quality === "low" ? 1 : [1, 1.5]}
      camera={{ position: [-145, 85, -45], fov: 43, near: 2, far: 14000 }}
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
      <hemisphereLight args={["#e4eef5", "#64746c", 1.4]} />
      <SunLight enabled={quality === "balanced"} />
      <ArchitecturalLod
        enabled={buildingsEnabled && quality === "balanced"}
        {...architectural}
      />
      <CityGeometry
        data={data}
        prepared={prepared.city}
        architecture={architectural.tile}
        enhancement={enhancement}
      />
      <EnhancementShadows tile={enhancement} />
      <CameraControls data={data} />
      <StaticShadows />
    </Canvas>
  );
}
