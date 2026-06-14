import type { StyleSpecification } from "maplibre-gl";
import { NEPAL_OUTLINE, NEPAL_OUTSIDE_MASK } from "./nepal-shape";

// Pure blueprint style — no roads, POIs, water, or commercial layers.
// Uses Natural Earth admin polygons via the free MapLibre demotiles source
// for province / country outlines; provinces and capitals are layered on top
// from a tiny inline GeoJSON so the look stays consistent worldwide.

const PROVINCE_CAPITALS: { name: string; lng: number; lat: number }[] = [
  { name: "Kathmandu", lng: 85.324, lat: 27.7172 },
  { name: "Biratnagar", lng: 87.2839, lat: 26.4525 },
  { name: "Janakpur", lng: 85.9266, lat: 26.7271 },
  { name: "Hetauda", lng: 85.0322, lat: 27.4287 },
  { name: "Pokhara", lng: 83.9856, lat: 28.2096 },
  { name: "Deukhuri", lng: 82.287, lat: 27.9881 },
  { name: "Birendranagar", lng: 81.6339, lat: 28.6045 },
  { name: "Godawari", lng: 80.5898, lat: 28.9985 },
];

const PROVINCE_LABELS: { name: string; lng: number; lat: number }[] = [
  { name: "KOSHI", lng: 87.3, lat: 27.3 },
  { name: "MADHESH", lng: 86.0, lat: 26.8 },
  { name: "BAGMATI", lng: 85.3, lat: 27.9 },
  { name: "GANDAKI", lng: 84.0, lat: 28.5 },
  { name: "LUMBINI", lng: 82.5, lat: 27.9 },
  { name: "KARNALI", lng: 82.5, lat: 29.3 },
  { name: "SUDURPASHCHIM", lng: 81.0, lat: 29.3 },
];

export function buildMapStyle(theme: "light" | "dark"): StyleSpecification {
  const base = theme === "dark" ? "#0A0A0A" : "#F9F9F9";

  const label = theme === "dark" ? "#FFFFFF" : "#1A1A1A";
  const labelHalo = theme === "dark" ? "rgba(0,0,0,0.85)" : "rgba(255,255,255,0.9)";

  return {
    version: 8,
    glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
    sources: {
      basemap: {
        type: "raster",
        tiles:
          theme === "dark"
            ? [
                "https://a.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}.png",
                "https://b.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}.png",
                "https://c.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}.png",
                "https://d.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}.png",
              ]
            : [
                "https://a.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}.png",
                "https://b.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}.png",
                "https://c.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}.png",
                "https://d.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}.png",
              ],
        tileSize: 256,
        attribution: "© OpenStreetMap © CARTO",
        maxzoom: 19,
      },
      capitals: {
        type: "geojson",
        data: {
          type: "FeatureCollection",
          features: PROVINCE_CAPITALS.map((c) => ({
            type: "Feature",
            properties: { name: c.name },
            geometry: { type: "Point", coordinates: [c.lng, c.lat] },
          })),
        },
      },
      provinces: {
        type: "geojson",
        data: {
          type: "FeatureCollection",
          features: PROVINCE_LABELS.map((c) => ({
            type: "Feature",
            properties: { name: c.name },
            geometry: { type: "Point", coordinates: [c.lng, c.lat] },
          })),
        },
      },
      nepalMask: {
        type: "geojson",
        data: NEPAL_OUTSIDE_MASK,
      },
      nepalOutline: {
        type: "geojson",
        data: NEPAL_OUTLINE,
      },
    },

    layers: [
      { id: "bg", type: "background", paint: { "background-color": base } },
      {
        id: "basemap",
        type: "raster",
        source: "basemap",
        paint: {
          "raster-opacity": 0.85,
          "raster-saturation": -0.2,
          "raster-contrast": 0.05,
        },
      },
      {
        id: "outside-nepal-mask",
        type: "fill",
        source: "nepalMask",
        paint: {
          "fill-color": base,
          "fill-opacity": 0.96,
        },
      },
      {
        id: "nepal-boundary-glow",
        type: "line",
        source: "nepalOutline",
        paint: {
          "line-color": theme === "dark" ? "#32D7FF" : "#0A0A0A",
          "line-width": ["interpolate", ["linear"], ["zoom"], 5, 2, 10, 5],
          "line-opacity": 0.35,
          "line-blur": 2,
        },
      },
      {
        id: "nepal-boundary",
        type: "line",
        source: "nepalOutline",
        paint: {
          "line-color": label,
          "line-width": ["interpolate", ["linear"], ["zoom"], 5, 1, 10, 2],
          "line-opacity": 0.6,
        },
      },

      {
        id: "province-label",
        type: "symbol",
        source: "provinces",
        minzoom: 5,
        layout: {
          "text-field": ["get", "name"],
          "text-font": ["Noto Sans Bold"],
          "text-size": ["interpolate", ["linear"], ["zoom"], 5, 10, 10, 16],
          "text-letter-spacing": 0.2,
        },
        paint: {
          "text-color": label,
          "text-halo-color": labelHalo,
          "text-halo-width": 1.2,
          "text-opacity": 0.7,
        },
      },
      {
        id: "capital-dot",
        type: "circle",
        source: "capitals",
        minzoom: 6,
        paint: {
          "circle-radius": 3,
          "circle-color": label,
          "circle-stroke-color": base,
          "circle-stroke-width": 1.5,
        },
      },
      {
        id: "capital-label",
        type: "symbol",
        source: "capitals",
        minzoom: 7,
        layout: {
          "text-field": ["get", "name"],
          "text-font": ["Noto Sans Regular"],
          "text-size": 11,
          "text-offset": [0, 1.1],
          "text-anchor": "top",
        },
        paint: {
          "text-color": label,
          "text-halo-color": labelHalo,
          "text-halo-width": 1.4,
        },
      },
    ],
  };
}

export const NEPAL_CENTER: [number, number] = [84.124, 28.3949];
