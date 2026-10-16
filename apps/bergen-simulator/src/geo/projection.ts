import type { Point } from "./types";

const RADIUS = 6371008.8;
const RAD = Math.PI / 180;

// Local equirectangular tangent approximation; sufficient for this ~3 km extent.
// X is east, Z is south; 1 world unit = 1 metre. No vertical exaggeration.
export function project([lon, lat]: Point, [lon0, lat0]: Point): Point {
  return [
    RADIUS * (lon - lon0) * RAD * Math.cos(lat0 * RAD),
    -RADIUS * (lat - lat0) * RAD,
  ];
}

export function unproject([x, z]: Point, [lon0, lat0]: Point): Point {
  return [
    lon0 + x / (RADIUS * RAD * Math.cos(lat0 * RAD)),
    lat0 - z / (RADIUS * RAD),
  ];
}
