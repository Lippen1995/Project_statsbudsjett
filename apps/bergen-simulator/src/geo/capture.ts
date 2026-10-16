import { addAfterEffect, addEffect } from "@react-three/fiber";
import type { Camera, WebGLRenderer } from "three";
import type { OrbitControls } from "three/addons/controls/OrbitControls.js";

// Local acceptance harness only: fixed cameras and renderer counters, no extra
// render loop, production UI, network requests or authentication changes.
export function installCapture(
  camera: Camera,
  gl: WebGLRenderer,
  orbit: OrbitControls,
  invalidate: () => void,
) {
  if (
    !["localhost", "127.0.0.1"].includes(location.hostname) ||
    new URLSearchParams(location.search).get("capture") !== "1"
  )
    return () => {};
  let start = 0,
    previous = -1,
    frames = 0,
    requested = 0;
  const before = addEffect(() => {
    start = performance.now();
  });
  const after = addAfterEffect(() => {
    if (previous === gl.info.render.frame) return;
    previous = gl.info.render.frame;
    gl.domElement.dataset.capture = JSON.stringify({
      frames: ++frames,
      cpuFrameMs: performance.now() - start,
      cameraLatencyMs: requested ? performance.now() - requested : null,
      calls: gl.info.render.calls,
      triangles: gl.info.render.triangles,
      lines: gl.info.render.lines,
      geometries: gl.info.memory.geometries,
      textures: gl.info.memory.textures,
      pixelRatio: gl.getPixelRatio(),
      position: camera.position.toArray(),
      target: orbit.target.toArray(),
    });
  });
  const setView = (event: Event) => {
    const { position, target } = (event as CustomEvent).detail ?? {};
    if (
      ![position, target].every(
        (v) => Array.isArray(v) && v.length === 3 && v.every(Number.isFinite),
      )
    )
      return;
    requested = performance.now();
    camera.position.fromArray(position);
    orbit.target.fromArray(target);
    orbit.update();
    invalidate();
  };
  gl.domElement.addEventListener("bergen:capture", setView);
  return () => {
    before();
    after();
    gl.domElement.removeEventListener("bergen:capture", setView);
    delete gl.domElement.dataset.capture;
  };
}
