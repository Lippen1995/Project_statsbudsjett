import {
  BufferGeometry,
  Mesh,
  MeshStandardMaterial,
  Texture,
  SRGBColorSpace,
  LinearMipmapLinearFilter,
  ClampToEdgeWrapping,
} from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import type { CityData } from "../geo/types";
import type { FeatureRange } from "../geo/geometry";
import { assertAssetSnapshot, assetIds, catalogue } from "./model";

export interface ArchitecturalTile {
  body: { geometry: BufferGeometry; ranges: FeatureRange[] };
  facade: { geometry: BufferGeometry; ranges: FeatureRange[] };
  texture: Texture;
  dispose: () => void;
}
export function checkedGlbJson(bytes: ArrayBuffer) {
  const view = new DataView(bytes);
  if (
    bytes.byteLength !== catalogue.bytes ||
    bytes.byteLength > 256 * 1024 ||
    view.getUint32(0, true) !== 0x46546c67 ||
    view.getUint32(4, true) !== 2 ||
    view.getUint32(8, true) !== bytes.byteLength ||
    view.getUint32(16, true) !== 0x4e4f534a
  )
    throw new Error("Invalid architectural GLB envelope");
  const length = view.getUint32(12, true);
  if (length > 48 * 1024 || 20 + length > bytes.byteLength)
    throw new Error("Invalid GLB JSON bound");
  const json = JSON.parse(
    new TextDecoder().decode(new Uint8Array(bytes, 20, length)),
  );
  if (
    json.asset?.version !== "2.0" ||
    json.extensionsRequired?.length ||
    json.buffers?.length !== 1 ||
    json.buffers[0].uri ||
    json.images?.length !== 1 ||
    json.images[0].uri ||
    json.images[0].mimeType !== "image/jpeg" ||
    json.meshes?.length !== 13 ||
    json.nodes?.length !== 13 ||
    json.materials?.length !== 2
  )
    throw new Error("Unsupported architectural asset resources");
  return json;
}

export async function loadArchitecturalTile(
  data: CityData,
  signal: AbortSignal,
): Promise<ArchitecturalTile> {
  assertAssetSnapshot(data);
  const response = await fetch(catalogue.url, { signal, cache: "force-cache" });
  if (!response.ok)
    throw new Error(
      "Architectural asset unavailable; original geometry retained.",
    );
  const bytes = await response.arrayBuffer();
  const json = checkedGlbJson(bytes);
  const digest = [
    ...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
  ]
    .map((v) => v.toString(16).padStart(2, "0"))
    .join("");
  if (digest !== catalogue.sha256)
    throw new Error("Architectural asset integrity failure");
  signal.throwIfAborted();
  // Decode embedded bytes directly. GLTFLoader's default blob-URL fetch violates
  // the existing connect-src self CSP; do not weaken hosting security for assets.
  const image = json.bufferViews[json.images[0].bufferView];
  const binaryStart = 20 + new DataView(bytes).getUint32(12, true) + 8;
  const bitmap = await createImageBitmap(
    new Blob(
      [
        new Uint8Array(
          bytes,
          binaryStart + (image.byteOffset ?? 0),
          image.byteLength,
        ),
      ],
      { type: "image/jpeg" },
    ),
  );
  if (bitmap.width !== 1024 || bitmap.height !== 1024) {
    bitmap.close();
    throw new Error("Invalid atlas dimensions");
  }
  const embedded = new Texture(bitmap);
  embedded.flipY = false;
  embedded.colorSpace = SRGBColorSpace;
  embedded.minFilter = LinearMipmapLinearFilter;
  embedded.wrapS = embedded.wrapT = ClampToEdgeWrapping;
  embedded.needsUpdate = true;
  let gltf;
  try {
    signal.throwIfAborted();
    gltf = await new GLTFLoader()
      .register(() => ({
        name: "BERGEN_embedded_atlas",
        loadTexture: () => Promise.resolve(embedded),
      }))
      .parseAsync(bytes, "");
  } catch (error) {
    embedded.dispose();
    bitmap.close();
    throw error;
  }
  const groups = {
    body: [] as BufferGeometry[],
    facade: [] as BufferGeometry[],
  };
  const ranges = { body: [] as FeatureRange[], facade: [] as FeatureRange[] };
  const materials = new Set<MeshStandardMaterial>();
  let texture: Texture | undefined;
  const merged: BufferGeometry[] = [];
  const cleanup = () => {
    Object.values(groups)
      .flat()
      .forEach((g) => g.dispose());
    merged.forEach((g) => g.dispose());
    materials.forEach((m) => m.dispose());
    embedded.dispose();
    bitmap.close();
  };
  try {
    gltf.scene.traverse((object) => {
      if (!(object instanceof Mesh)) return;
      const id = object.userData.sourceId,
        layer = object.userData.layer;
      if (!assetIds.has(id) || !["body", "facade"].includes(layer))
        throw new Error("Invalid asset identity");
      const kind = layer as keyof typeof groups;
      const feature = data.buildings.find((b) => b.id === id)!;
      const g = object.geometry as BufferGeometry;
      groups[kind].push(g);
      const p = g.getAttribute("position"),
        n = g.getAttribute("normal");
      if (
        g.index ||
        !p ||
        !n ||
        p.count > 200 ||
        p.count % 3 ||
        n.count !== p.count
      )
        throw new Error("Invalid architectural geometry");
      for (let i = 0; i < p.count; i++) {
        if (
          ![
            p.getX(i),
            p.getY(i),
            p.getZ(i),
            n.getX(i),
            n.getY(i),
            n.getZ(i),
          ].every(Number.isFinite) ||
          p.getX(i) < -100 ||
          p.getX(i) > 100 ||
          p.getZ(i) < -340 ||
          p.getZ(i) > -100 ||
          p.getY(i) < 0 ||
          p.getY(i) > 40
        )
          throw new Error("Out of bounds architectural geometry");
      }
      const previous = ranges[kind].at(-1)?.end ?? 0;
      ranges[kind].push({ end: previous + p.count / 3, feature });
      const material = object.material as MeshStandardMaterial;
      materials.add(material);
      if (material.map) texture = material.map;
    });
    if (groups.body.length !== 7 || groups.facade.length !== 6 || !texture)
      throw new Error("Incomplete architectural tile");
    if (texture.image.width !== 1024 || texture.image.height !== 1024)
      throw new Error("Unbounded architectural texture");
    signal.throwIfAborted();
    const body = mergeGeometries(groups.body, false),
      facade = mergeGeometries(groups.facade, false);
    if (!body || !facade) throw new Error("Architectural batching failed");
    merged.push(body, facade);
    for (const g of merged) g.computeBoundingSphere();
    texture.colorSpace = SRGBColorSpace;
    Object.values(groups)
      .flat()
      .forEach((g) => g.dispose());
    materials.forEach((m) => m.dispose());
    const retainedTexture = texture;
    let disposed = false;
    return {
      body: { geometry: body, ranges: ranges.body },
      facade: { geometry: facade, ranges: ranges.facade },
      texture,
      dispose: () => {
        if (disposed) return;
        disposed = true;
        merged.forEach((g) => g.dispose());
        retainedTexture.dispose();
        retainedTexture.image?.close?.();
      },
    };
  } catch (error) {
    cleanup();
    throw error;
  }
}
