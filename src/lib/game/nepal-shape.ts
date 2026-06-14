import type { FeatureCollection, Polygon } from "geojson";
import { NEPAL_COORDINATES } from "./nepal-boundary";

type Position = [number, number];

const WORLD_RING: Position[] = [
  [-180, -85],
  [180, -85],
  [180, 85],
  [-180, 85],
  [-180, -85],
];

const NEPAL_RINGS = NEPAL_COORDINATES.map((ring) =>
  ring.map(([lng, lat]) => [lng, lat] as Position),
);

const NEPAL_OUTER_RING = NEPAL_RINGS[0];

export const NEPAL_BOUNDS: [[number, number], [number, number]] = [
  [79.9, 26.15],
  [88.36, 30.67],
];

export const NEPAL_OUTLINE: FeatureCollection<Polygon> = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      properties: {},
      geometry: {
        type: "Polygon",
        coordinates: NEPAL_RINGS,
      },
    },
  ],
};

export const NEPAL_OUTSIDE_MASK: FeatureCollection<Polygon> = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      properties: {},
      geometry: {
        type: "Polygon",
        coordinates: [WORLD_RING, [...NEPAL_OUTER_RING].reverse()],
      },
    },
  ],
};

export function pointInNepal(point: { lng: number; lat: number }) {
  const p: Position = [point.lng, point.lat];
  if (!pointInRing(p, NEPAL_OUTER_RING)) return false;
  return NEPAL_RINGS.slice(1).every((hole) => !pointInRing(p, hole));
}

function pointInRing(point: Position, ring: Position[]) {
  const [x, y] = point;
  let inside = false;

  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0];
    const yi = ring[i][1];
    const xj = ring[j][0];
    const yj = ring[j][1];
    const intersects = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }

  return inside;
}
