import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { beforeAll, it, expect, vi } from "vitest";
import { Scene, Mesh, BoxGeometry } from "three";
import {
  prepareCity,
  unpackCity,
  transferBuffers,
  disposePrepared,
  type PreparedReply,
} from "../src/geo/preparation";
import { startCityPreparation } from "../src/geo/preparation-client";
import {
  diagnosticsEnabled,
  preparation,
  preparationSnapshot,
  attributeMemory,
} from "../src/geo/diagnostics";
import type { CityData } from "../src/geo/types";
const data = JSON.parse(
  readFileSync("public/data/bergen.json", "utf8"),
) as CityData;
let reply: PreparedReply;
beforeAll(() => {
  const before = JSON.stringify(data);
  reply = prepareCity(data, 1);
  expect(JSON.stringify(data)).toBe(before);
}, 30000);
class FakeWorker {
  onmessage: Worker["onmessage"] = null;
  onerror: Worker["onerror"] = null;
  terminated = 0;
  request: unknown;
  postMessage(value: unknown) {
    this.request = value;
  }
  terminate() {
    this.terminated++;
  }
  emit(value: unknown) {
    this.onmessage?.call(
      this as unknown as Worker,
      new MessageEvent("message", { data: value }),
    );
  }
  error() {
    this.onerror?.call(this as unknown as Worker, {} as ErrorEvent);
  }
}
it("transfers all fixed geometry buffers without copies and preserves R1 attributes", () => {
  const cloned = structuredClone(reply),
    buffers = transferBuffers(cloned);
  expect(new Set(buffers).size).toBe(buffers.length);
  const moved = structuredClone(cloned, { transfer: buffers });
  expect(buffers.every((b) => b.byteLength === 0)).toBe(true);
  const city = unpackCity(moved, data, 1);
  const baseline = JSON.parse(
    readFileSync("tests/geometry-baseline-r1.json", "utf8"),
  );
  for (const [key, g] of Object.entries({
    buildings: city.buildings.geometry,
    roads: city.roads.geometry,
    terrain: city.terrain,
    water: city.water,
    coast: city.coast,
    roofEdges: city.roofEdges,
  })) {
    const h = createHash("sha256");
    for (const [name, a] of Object.entries(g.attributes).sort(([a], [b]) =>
      a.localeCompare(b),
    )) {
      h.update(name);
      h.update(
        Buffer.from(a.array.buffer, a.array.byteOffset, a.array.byteLength),
      );
    }
    if (g.index) {
      h.update("index");
      const a = g.index.array;
      h.update(Buffer.from(a.buffer, a.byteOffset, a.byteLength));
    }
    expect(h.digest("hex")).toBe(baseline.geometry[key].sha256);
  }
  expect(city.buildings.ranges[0].feature).toBe(data.buildings[0]);
  disposePrepared(city);
});
it.each([0, 2, NaN])(
  "rejects wrong/invalid preparation generation %s",
  (requestId) => {
    expect(() => unpackCity({ ...reply, requestId }, data, 1)).toThrow();
  },
);
it("rejects malformed attributes, source identities, nonfinite bounds and unbounded output", () => {
  for (const roofEdges of [
    undefined,
    { ...reply.layers.roofEdges, position: new Float32Array(12006) },
    { ...reply.layers.roofEdges, index: new Uint16Array([0, 1, 2]) },
  ]) {
    expect(() =>
      unpackCity({ ...reply, layers: { ...reply.layers, roofEdges } }, data, 1),
    ).toThrow();
  }
  expect(() =>
    unpackCity(
      {
        ...reply,
        layers: {
          ...reply.layers,
          coast: {
            ...reply.layers.coast,
            position: new Float32Array([NaN, 0, 0]),
          },
        },
      },
      data,
      1,
    ),
  ).toThrow();
  expect(() =>
    unpackCity(
      {
        ...reply,
        ranges: { ...reply.ranges, buildings: [{ id: "way/invalid", end: 3 }] },
      },
      data,
      1,
    ),
  ).toThrow();
  expect(() =>
    unpackCity(
      {
        ...reply,
        layers: {
          ...reply.layers,
          terrain: { ...reply.layers.terrain, sphere: [0, 0, 0, Infinity] },
        },
      },
      data,
      1,
    ),
  ).toThrow();
  expect(() =>
    unpackCity(
      {
        ...reply,
        layers: {
          ...reply.layers,
          terrain: {
            ...reply.layers.terrain,
            index: new Uint32Array([99999999, 0, 0]),
          },
        },
      },
      data,
      1,
    ),
  ).toThrow();
  expect(() =>
    unpackCity(
      { ...reply, stages: [{ name: "bad", durationMs: NaN }] },
      data,
      1,
    ),
  ).toThrow();
  expect(() =>
    prepareCity(
      { ...data, buildings: Array(10001).fill(data.buildings[0]) },
      1,
    ),
  ).toThrow();
});
it("cancels workers and ignores late geometry without changing source data", () => {
  const w = new FakeWorker(),
    ready = vi.fn(),
    error = vi.fn();
  const stop = startCityPreparation(data, ready, error, () => w);
  expect(w.request).toEqual({ version: 2, requestId: 1, geography: data });
  stop();
  w.emit(reply);
  expect(ready).not.toHaveBeenCalled();
  expect(error).not.toHaveBeenCalled();
  expect(w.terminated).toBe(1);
});
it("owns exactly six disposable batches and never accepts a second reply", () => {
  const w = new FakeWorker(),
    ready = vi.fn(),
    error = vi.fn();
  const stop = startCityPreparation(data, ready, error, () => w);
  w.emit({ ...reply, requestId: 2 });
  expect(ready).not.toHaveBeenCalled();
  w.emit(reply);
  expect(ready).toHaveBeenCalledTimes(1);
  w.emit(reply);
  expect(ready).toHaveBeenCalledTimes(1);
  const city = ready.mock.calls[0][0];
  const dispose = vi.fn();
  for (const g of [
    city.buildings.geometry,
    city.roads.geometry,
    city.terrain,
    city.water,
    city.coast,
    city.roofEdges,
  ])
    g.addEventListener("dispose", dispose);
  stop();
  stop();
  expect(dispose).toHaveBeenCalledTimes(6);
  expect(error).not.toHaveBeenCalled();
});
it("fails explicitly on malformed worker replies or worker startup failure", () => {
  for (const value of [
    null,
    { version: 99, requestId: 1 },
    { version: 1, type: "error" },
  ]) {
    const w = new FakeWorker(),
      ready = vi.fn(),
      error = vi.fn();
    const stop = startCityPreparation(data, ready, error, () => w);
    w.emit(value);
    expect(error).toHaveBeenCalledTimes(1);
    expect(ready).not.toHaveBeenCalled();
    stop();
  }
  const error = vi.fn();
  startCityPreparation(data, vi.fn(), error, () => {
    throw new Error("startup");
  })();
  expect(error).toHaveBeenCalledTimes(1);
});
it("terminates failed preparation and isolates a replacement job from stale output", () => {
  const old = new FakeWorker(),
    next = new FakeWorker(),
    ready = vi.fn(),
    error = vi.fn();
  const stop = startCityPreparation(data, ready, error, () => old);
  old.error();
  expect(error).toHaveBeenCalledTimes(1);
  stop();
  const cleanup = startCityPreparation(data, ready, error, () => next);
  old.emit(reply);
  expect(ready).not.toHaveBeenCalled();
  next.emit(reply);
  expect(ready).toHaveBeenCalledTimes(1);
  cleanup();
});
it("keeps diagnostics local-only and bounded without altering return values", () => {
  try {
    vi.stubGlobal(
      "location",
      new URL("https://bergen-reimagined.vercel.app/?capture=1"),
    );
    expect(diagnosticsEnabled()).toBe(false);
    expect(preparation("private", () => 42)).toBe(42);
    expect(preparationSnapshot()).toEqual([]);
    vi.stubGlobal("location", new URL("http://127.0.0.1:4180/?capture=1"));
    expect(diagnosticsEnabled()).toBe(true);
    for (let i = 0; i < 200; i++) preparation("test", () => i);
    expect(preparationSnapshot()).toHaveLength(128);
    vi.stubGlobal("location", new URL("http://127.0.0.1:4180/"));
    expect(diagnosticsEnabled()).toBe(false);
  } finally {
    vi.unstubAllGlobals();
  }
});
it("counts shared typed attribute arrays once, without claiming native GPU memory", () => {
  const scene = new Scene(),
    g = new BoxGeometry();
  scene.add(new Mesh(g), new Mesh(g));
  const s = attributeMemory(scene);
  expect(s.attributeArrays).toBe(Object.keys(g.attributes).length + 1);
  expect(s.attributeBytes).toBeGreaterThan(0);
  g.dispose();
});

it("bounds a stalled geometry worker without retaining a timer or accepting a late reply", () => {
  vi.useFakeTimers();
  try {
    const w = new FakeWorker(),
      ready = vi.fn(),
      error = vi.fn();
    const stop = startCityPreparation(data, ready, error, () => w);
    vi.advanceTimersByTime(30000);
    expect(error).toHaveBeenCalledTimes(1);
    expect(w.terminated).toBe(1);
    w.emit(reply);
    expect(ready).not.toHaveBeenCalled();
    stop();
    expect(vi.getTimerCount()).toBe(0);
  } finally {
    vi.useRealTimers();
  }
});
it("disposes prepared buffers if the consumer rejects the result", () => {
  const w = new FakeWorker(),
    error = vi.fn();
  const stop = startCityPreparation(
    data,
    () => {
      throw new Error("consumer");
    },
    error,
    () => w,
  );
  w.emit(reply);
  expect(error).toHaveBeenCalledTimes(1);
  stop();
});
