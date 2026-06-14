// Coarse lat/lng grid clipped to Nepal bbox. ~0.05° steps keep cell count
// manageable for low-end devices (~3000 cells). Cell size is a constant —
// tighten later when moving to server-side tiles.
import type { FeatureCollection, Feature, Polygon } from "geojson";

export const NEPAL_BBOX = { minLng: 80.0, minLat: 26.3, maxLng: 88.3, maxLat: 30.5 };
export const CELL_DEG = 0.05;

export interface ZoneProps {
  id: string;
  centerLng: number;
  centerLat: number;
}

export function buildGrid(): FeatureCollection<Polygon, ZoneProps> {
  const features: Feature<Polygon, ZoneProps>[] = [];
  let i = 0;
  for (let lng = NEPAL_BBOX.minLng; lng < NEPAL_BBOX.maxLng; lng += CELL_DEG) {
    let j = 0;
    for (let lat = NEPAL_BBOX.minLat; lat < NEPAL_BBOX.maxLat; lat += CELL_DEG) {
      const id = `Z-${i.toString(36)}-${j.toString(36)}`.toUpperCase();
      features.push({
        type: "Feature",
        id: features.length, // numeric id for MapLibre feature-state
        properties: {
          id,
          centerLng: lng + CELL_DEG / 2,
          centerLat: lat + CELL_DEG / 2,
        },
        geometry: {
          type: "Polygon",
          coordinates: [
            [
              [lng, lat],
              [lng + CELL_DEG, lat],
              [lng + CELL_DEG, lat + CELL_DEG],
              [lng, lat + CELL_DEG],
              [lng, lat],
            ],
          ],
        },
      });
      j++;
    }
    i++;
  }
  return { type: "FeatureCollection", features };
}

export function haversineMeters(a: [number, number], b: [number, number]) {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b[1] - a[1]);
  const dLng = toRad(b[0] - a[0]);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a[1])) * Math.cos(toRad(b[1])) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}
