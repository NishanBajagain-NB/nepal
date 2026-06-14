import type { Feature, FeatureCollection, Polygon } from "geojson";
import type { TerritoryPatch } from "./types";

export interface TerritoryProps {
  id: string;
  ownerId: string;
  centerLng: number;
  centerLat: number;
  radiusMeters: number;
  contested: boolean;
  defense: number;
}

const EARTH_METERS_PER_DEGREE = 111_320;

export function circlePolygon(lng: number, lat: number, radiusMeters: number, steps = 36): Polygon {
  const coords: [number, number][] = [];
  const latRadius = radiusMeters / EARTH_METERS_PER_DEGREE;
  const lngRadius = radiusMeters / (EARTH_METERS_PER_DEGREE * Math.cos((lat * Math.PI) / 180));

  for (let i = 0; i <= steps; i++) {
    const angle = (i / steps) * Math.PI * 2;
    coords.push([lng + Math.cos(angle) * lngRadius, lat + Math.sin(angle) * latRadius]);
  }

  return { type: "Polygon", coordinates: [coords] };
}

export function patchesToFeatureCollection(
  patches: TerritoryPatch[],
): FeatureCollection<Polygon, TerritoryProps> {
  return {
    type: "FeatureCollection",
    features: patches.map(
      (patch): Feature<Polygon, TerritoryProps> => ({
        type: "Feature",
        id: patch.id,
        properties: {
          id: patch.id,
          ownerId: patch.ownerId,
          centerLng: patch.lng,
          centerLat: patch.lat,
          radiusMeters: patch.radiusMeters,
          contested: patch.contested,
          defense: patch.defense,
        },
        geometry: circlePolygon(patch.lng, patch.lat, patch.radiusMeters),
      }),
    ),
  };
}

export function emptyTerritoryCollection(): FeatureCollection<Polygon, TerritoryProps> {
  return { type: "FeatureCollection", features: [] };
}
