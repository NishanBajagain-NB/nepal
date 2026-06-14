import type { Map as MlMap } from "maplibre-gl";

let mapInstance: MlMap | null = null;

export function setMapInstance(m: MlMap | null) {
  mapInstance = m;
}

export function getMap(): MlMap | null {
  return mapInstance;
}
