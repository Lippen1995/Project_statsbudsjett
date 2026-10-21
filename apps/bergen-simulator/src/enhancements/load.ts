import { BufferGeometry, Mesh, Material } from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import type { CityData } from "../geo/types";
import type { FeatureRange } from "../geo/geometry";
import { assertEnhancementSnapshot, catalogue, enhancementIds } from "./model";

export type EnhancementTile = {
  geometry: BufferGeometry;
  ranges: FeatureRange[];
  dispose: () => void;
};

export function checkedEnhancementGlb(bytes: ArrayBuffer) {
  if (
    bytes.byteLength !== catalogue.bytes ||
    bytes.byteLength < 28 ||
    bytes.byteLength > 256 * 1024
  )
    throw new Error("Invalid public-geodata asset size");
  const v = new DataView(bytes),
    length = v.getUint32(12, true);
  if (
    v.getUint32(0, true) !== 0x46546c67 ||
    v.getUint32(4, true) !== 2 ||
    v.getUint32(8, true) !== bytes.byteLength ||
    v.getUint32(16, true) !== 0x4e4f534a ||
    length > 48 * 1024 ||
    length + 28 > bytes.byteLength
  )
    throw new Error("Invalid public-geodata GLB");
  const json = JSON.parse(
    new TextDecoder().decode(new Uint8Array(bytes, 20, length)),
  );
  if (
    json.asset?.version !== "2.0" ||
    json.extensionsRequired?.length ||
    json.extensionsUsed?.length ||
    json.images?.length ||
    json.textures?.length ||
    json.buffers?.length !== 1 ||
    json.buffers[0].uri ||
    json.nodes?.length !== catalogue.buildings.length ||
    json.meshes?.length !== catalogue.buildings.length ||
    json.materials?.length !== 1 ||
    json.accessors?.length !== catalogue.buildings.length * 2 ||
    json.bufferViews?.some((b: { uri?: string }) => b.uri)
  )
    throw new Error("Unsupported public-geodata resources");
  for (const n of json.nodes) {
    if (
      n.children ||
      n.matrix ||
      n.translation ||
      n.rotation ||
      n.scale ||
      !enhancementIds.has(n.extras?.sourceId)
    )
      throw new Error("Unexpected public-geodata transform or identity");
  }
  const binaryStart = 20 + length;
  if (
    v.getUint32(binaryStart + 4, true) !== 0x004e4942 ||
    v.getUint32(binaryStart, true) + binaryStart + 8 !== bytes.byteLength ||
    json.buffers[0].byteLength !== v.getUint32(binaryStart, true) ||
    json.bufferViews?.length !== catalogue.buildings.length * 2 ||
    json.animations?.length ||
    json.skins?.length ||
    json.cameras?.length
  )
    throw new Error("Unexpected public-geodata binary resources");
  for (let i = 0; i < json.nodes.length; i++) {
    const node = json.nodes[i],
      primitive = json.meshes[i]?.primitives?.[0];
    const record = catalogue.buildings.find(
      (b) => b.id === node.extras.sourceId,
    );
    if (
      node.mesh !== i ||
      json.meshes[i].primitives.length !== 1 ||
      !record ||
      primitive.material !== 0 ||
      primitive.indices !== undefined ||
      primitive.targets ||
      (primitive.mode !== undefined && primitive.mode !== 4) ||
      primitive.attributes?.POSITION !== i * 2 ||
      primitive.attributes?.COLOR_0 !== i * 2 + 1
    )
      throw new Error("Unexpected public-geodata primitive");
    for (const a of [i * 2, i * 2 + 1]) {
      const accessor = json.accessors[a],
        buffer = json.bufferViews[a];
      if (
        accessor.bufferView !== a ||
        accessor.sparse ||
        accessor.byteOffset ||
        accessor.componentType !== 5126 ||
        accessor.type !== "VEC3" ||
        accessor.count !== record.triangles * 3 ||
        buffer.buffer !== 0 ||
        buffer.byteStride ||
        !Number.isInteger(buffer.byteOffset) ||
        buffer.byteOffset < 0 ||
        buffer.byteLength !== accessor.count * 12 ||
        buffer.byteOffset + buffer.byteLength > json.buffers[0].byteLength
      )
        throw new Error("Unexpected public-geodata buffer bounds");
    }
  }
  return json;
}

export async function loadEnhancements(
  data: CityData,
  signal: AbortSignal,
): Promise<EnhancementTile> {
  assertEnhancementSnapshot(data);
  const response = await fetch(catalogue.url, { signal, cache: "force-cache" });
  if (!response.ok) throw new Error("Public-geodata asset unavailable");
  const bytes = await response.arrayBuffer();
  checkedEnhancementGlb(bytes);
  const sha = [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))]
    .map((v) => v.toString(16).padStart(2, "0"))
    .join("");
  if (sha !== catalogue.sha256)
    throw new Error("Public-geodata integrity failure");
  signal.throwIfAborted();
  const gltf = await new GLTFLoader().parseAsync(bytes, "");
  const parts: BufferGeometry[] = [],
    materials = new Set<Material>(),
    ranges: FeatureRange[] = [];
  // Own every decoded resource before validating: a failure on the first mesh
  // must also dispose resources belonging to meshes not yet visited.
  gltf.scene.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    parts.push(object.geometry);
    for (const material of Array.isArray(object.material)
      ? object.material
      : [object.material])
      materials.add(material);
  });
  const seen = new Set<string>();
  let merged: BufferGeometry | null = null;
  try {
    let triangles = 0;
    gltf.scene.traverse((object) => {
      if (!(object instanceof Mesh)) return;
      const g = object.geometry as BufferGeometry;
      const id = object.userData.sourceId as string;
      const record = catalogue.buildings.find((b) => b.id === id);
      const feature = data.buildings.find((b) => b.id === id);
      const p = g.getAttribute("position"),
        c = g.getAttribute("color");
      if (
        !record ||
        !feature ||
        seen.has(id) ||
        g.index ||
        !p ||
        !c ||
        p.count !== record.triangles * 3 ||
        c.count !== p.count ||
        p.count > 7500
      )
        throw new Error("Invalid public-geodata geometry or picking identity");
      seen.add(id);
      const ring = record.footprint[0],
        xs = ring.map((p) => p[0]),
        zs = ring.map((p) => p[1]);
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i),
          y = p.getY(i),
          z = p.getZ(i);
        if (
          ![x, y, z, c.getX(i), c.getY(i), c.getZ(i)].every(Number.isFinite) ||
          x < Math.min(...xs) - 0.05 ||
          x > Math.max(...xs) + 0.05 ||
          z < Math.min(...zs) - 0.05 ||
          z > Math.max(...zs) + 0.05 ||
          y < -5 ||
          y > 60
        )
          throw new Error("Public-geodata geometry out of bounds");
      }
      g.computeVertexNormals();
      triangles += p.count / 3;
      ranges.push({ end: triangles, feature });
    });
    if (seen.size !== catalogue.buildings.length || ranges.at(-1)!.end > 2500)
      throw new Error("Incomplete public-geodata batch");
    merged = mergeGeometries(parts, false);
    if (!merged) throw new Error("Public-geodata batching failure");
    merged.computeBoundingSphere();
    signal.throwIfAborted();
    const owned = merged;
    merged = null;
    return { geometry: owned, ranges, dispose: () => owned.dispose() };
  } finally {
    parts.forEach((p) => p.dispose());
    materials.forEach((m) => m.dispose());
    merged?.dispose();
  }
}
