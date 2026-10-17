import type { Object3D, BufferGeometry } from "three";

// Local opt-in only. No timers, request loop, storage, network or production UI.
const MAX_ENTRIES = 128;
const entries: { name: string; durationMs: number }[] = [];
export function diagnosticsEnabled() {
  return (
    typeof location !== "undefined" &&
    ["localhost", "127.0.0.1"].includes(location.hostname) &&
    new URLSearchParams(location.search).get("capture") === "1"
  );
}
export function preparation<T>(name: string, run: () => T): T {
  if (!diagnosticsEnabled()) return run();
  const start = performance.now();
  try {
    return run();
  } finally {
    entries.push({ name, durationMs: performance.now() - start });
    if (entries.length > MAX_ENTRIES) entries.shift();
  }
}
export function recordPreparation(name: string, durationMs: number) {
  if (!diagnosticsEnabled()) return;
  entries.push({ name, durationMs });
  if (entries.length > MAX_ENTRIES) entries.shift();
}
export function preparationSnapshot() {
  return diagnosticsEnabled() ? entries.map((e) => ({ ...e })) : [];
}
/** Typed attribute arrays retained by scene objects, not measured native GPU VRAM. */
export function attributeMemory(scene: Object3D) {
  const arrays = new Set<ArrayBufferView>();
  scene.traverse((object) => {
    const geometry = (object as Object3D & { geometry?: BufferGeometry })
      .geometry;
    if (!geometry) return;
    for (const a of Object.values(geometry.attributes))
      if ("array" in a) arrays.add(a.array);
    if (geometry.index) arrays.add(geometry.index.array);
  });
  return {
    attributeArrays: arrays.size,
    attributeBytes: [...arrays].reduce((n, a) => n + a.byteLength, 0),
  };
}
