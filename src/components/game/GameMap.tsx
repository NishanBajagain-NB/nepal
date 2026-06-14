import { useEffect, useMemo, useRef } from "react";
import type {
  GeoJSONSource,
  Map as MlMap,
  Marker as MlMarker,
  StyleSpecification,
} from "maplibre-gl";
import type { FeatureCollection, LineString } from "geojson";

import { setMapInstance } from "@/lib/game/map-ref";
import { buildMapStyle, NEPAL_CENTER } from "@/lib/game/map-style";
import { NEPAL_BOUNDS } from "@/lib/game/nepal-shape";
import {
  circlePolygon,
  emptyTerritoryCollection,
  patchesToFeatureCollection,
} from "@/lib/game/territory";
import { useGame } from "@/lib/game/store";
import { TERRITORY_HEX } from "@/lib/game/types";
import { emitViewportChange } from "@/lib/api";

interface Props {
  onReady?: (map: MlMap) => void;
}

const EMPTY_TRAIL: FeatureCollection<LineString> = {
  type: "FeatureCollection",
  features: [],
};

const EMPTY_ACCURACY: FeatureCollection = {
  type: "FeatureCollection",
  features: [],
};

export function GameMap({ onReady }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MlMap | null>(null);
  const markerRef = useRef<MlMarker | null>(null);
  const selectedRef = useRef<string | null>(null);

  const theme = useGame((s) => s.theme);
  const user = useGame((s) => s.user);
  const position = useGame((s) => s.position);
  const leaderboard = useGame((s) => s.leaderboard);
  const movementTrail = useGame((s) => s.movementTrail);
  const selectedZoneId = useGame((s) => s.selectedZoneId);
  const territoryPatches = useGame((s) => s.territoryPatches);
  const setSelectedZone = useGame((s) => s.setSelectedZone);

  const ownerColors = useMemo(() => {
    const colors = new Map<string, string>();
    for (const entry of leaderboard) {
      colors.set(entry.player.id, TERRITORY_HEX[entry.player.color]);
    }
    if (user) colors.set(user.id, TERRITORY_HEX[user.color]);
    return colors;
  }, [leaderboard, user]);

  const territoryData = useMemo(
    () => patchesToFeatureCollection(territoryPatches),
    [territoryPatches],
  );

  const trailData = useMemo<FeatureCollection<LineString>>(() => {
    if (movementTrail.length < 2) return EMPTY_TRAIL;
    return {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: {},
          geometry: {
            type: "LineString",
            coordinates: movementTrail.map((p) => [p.lng, p.lat]),
          },
        },
      ],
    };
  }, [movementTrail]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    let disposed = false;
    let mapLocal: MlMap | null = null;
    let resizeHandler: (() => void) | null = null;

    (async () => {
      const maplibregl = (await import("maplibre-gl")).default;
      if (disposed || !containerRef.current) return;

      const map = new maplibregl.Map({
        container: containerRef.current,
        style: withGameLayers(buildMapStyle(useGame.getState().theme), useGame.getState().theme),
        center: NEPAL_CENTER,
        zoom: 6.6,
        minZoom: 5.6,
        maxZoom: 17,
        maxBounds: NEPAL_BOUNDS,
        pitch: 0,
        bearing: 0,
        attributionControl: false,
        dragRotate: false,
        pitchWithRotate: false,
      });

      map.touchZoomRotate.disableRotation();
      mapRef.current = map;
      mapLocal = map;

      resizeHandler = () => {
        map.resize();
        requestAnimationFrame(() => map.resize());
        window.setTimeout(() => map.resize(), 300);
      };

      map.on("load", async () => {
        syncTerritorySource(map, useGame.getState().territoryPatches);
        syncTrailSource(map, useGame.getState().movementTrail);
        syncAccuracySource(map, useGame.getState().position);
        syncOwnerPaint(map, buildOwnerColors());
        resizeHandler?.();

        // Create GPS marker immediately if position is already available
        const pos = useGame.getState().position;
        if (pos && !markerRef.current) {
          const maplibregl = (await import("maplibre-gl")).default;
          const playerUser = useGame.getState().user;
          const playerColor = playerUser ? TERRITORY_HEX[playerUser.color] : "#32D7FF";
          const element = document.createElement("div");
          element.className = "gps-marker";
          element.style.setProperty("--player-color", playerColor);
          markerRef.current = new maplibregl.Marker({ element, anchor: "center" })
            .setLngLat([pos.lng, pos.lat])
            .addTo(map);
          // Fly to user's position
          map.flyTo({ center: [pos.lng, pos.lat], zoom: 16, duration: 1800 });
        }

        map.on("click", "territory-fill", (event) => {
          const feature = event.features?.[0];
          if (feature?.properties?.id) setSelectedZone(String(feature.properties.id));
        });
        map.on("mouseenter", "territory-fill", () => {
          map.getCanvas().style.cursor = "pointer";
        });
        map.on("mouseleave", "territory-fill", () => {
          map.getCanvas().style.cursor = "";
        });

        const updateViewport = () => {
          const bounds = map.getBounds();
          const bbox = {
            w: bounds.getWest(),
            s: bounds.getSouth(),
            e: bounds.getEast(),
            n: bounds.getNorth(),
          };
          useGame.getState().fetchViewportZones(bbox);
          emitViewportChange(bbox);
        };

        map.on("moveend", updateViewport);
        updateViewport();

        setMapInstance(map);
        onReady?.(map);
      });

      map.on("styledata", resizeHandler);
      window.addEventListener("resize", resizeHandler);
    })();

    return () => {
      disposed = true;
      if (resizeHandler) window.removeEventListener("resize", resizeHandler);
      setMapInstance(null);
      mapLocal?.remove();
      mapRef.current = null;
    };
  }, [onReady, setSelectedZone]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.setStyle(withGameLayers(buildMapStyle(theme), theme));
    map.once("styledata", () => {
      syncTerritorySource(map, useGame.getState().territoryPatches);
      syncTrailSource(map, useGame.getState().movementTrail);
      syncAccuracySource(map, useGame.getState().position);
      syncOwnerPaint(map, ownerColors);
      map.resize();
    });
  }, [theme, ownerColors]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.getSource("territory")) return;
    (map.getSource("territory") as GeoJSONSource).setData(territoryData);
    syncOwnerPaint(map, ownerColors);
  }, [territoryData, ownerColors]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.getSource("trail")) return;
    (map.getSource("trail") as GeoJSONSource).setData(trailData);
  }, [trailData]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.getLayer("movement-trail") || !user) return;
    const c = TERRITORY_HEX[user.color] || "#FFFFFF";
    map.setPaintProperty("movement-trail", "line-color", c);
    if (map.getLayer("movement-trail-glow")) {
      map.setPaintProperty("movement-trail-glow", "line-color", c);
    }
    if (map.getLayer("movement-trail-outline")) {
      map.setPaintProperty("movement-trail-outline", "line-color", c);
    }
    // Sync accuracy circle color to player color
    if (map.getLayer("gps-accuracy")) {
      map.setPaintProperty("gps-accuracy", "fill-color", c);
    }
    if (map.getLayer("gps-accuracy-line")) {
      map.setPaintProperty("gps-accuracy-line", "line-color", c);
    }
  }, [user]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.getSource("territory")) return;
    if (selectedRef.current) {
      map.setFeatureState({ source: "territory", id: selectedRef.current }, { selected: false });
    }
    selectedRef.current = selectedZoneId;
    if (selectedZoneId) {
      map.setFeatureState({ source: "territory", id: selectedZoneId }, { selected: true });
    }
  }, [selectedZoneId]);

  // GPS marker creation/update — handles async map loading
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !position) return;
    let cancelled = false;

    const doMarker = async () => {
      const maplibregl = (await import("maplibre-gl")).default;
      if (cancelled || !mapRef.current) return;
      const playerColor = user ? TERRITORY_HEX[user.color] : "#32D7FF";
      if (!markerRef.current) {
        const element = document.createElement("div");
        element.className = "gps-marker";
        element.style.setProperty("--player-color", playerColor);
        markerRef.current = new maplibregl.Marker({ element, anchor: "center" })
          .setLngLat([position.lng, position.lat])
          .addTo(mapRef.current);
      } else {
        markerRef.current.setLngLat([position.lng, position.lat]);
        markerRef.current.getElement().style.setProperty("--player-color", playerColor);
      }
    };

    // Check both loaded() and isStyleLoaded() for maximum reliability
    if (map.loaded() || map.isStyleLoaded()) {
      doMarker();
    } else {
      const handler = () => { if (!cancelled) doMarker(); };
      map.once("load", handler);
      // Also try after a small delay as a safety net
      const timer = setTimeout(() => { if (!cancelled && mapRef.current) doMarker(); }, 2000);
      return () => {
        cancelled = true;
        map.off("load", handler);
        clearTimeout(timer);
      };
    }

    return () => { cancelled = true; };
  }, [position, user]);

  // Accuracy circle sync
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const doSync = () => syncAccuracySource(map, position);
    if (map.loaded() || map.isStyleLoaded()) {
      doSync();
    } else {
      map.once("load", doSync);
      return () => { map.off("load", doSync); };
    }
  }, [position]);

  // Auto flyTo on first position
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !position) return;
    if (map.getZoom() < 12) {
      map.flyTo({ center: [position.lng, position.lat], zoom: 16, duration: 1500 });
    }
  }, [position]);

  return (
    <div
      ref={containerRef}
      className="game-map-shell fixed inset-0 h-[100dvh] min-h-[100svh] w-[100dvw]"
    />
  );
}

function withGameLayers(style: StyleSpecification, theme: "light" | "dark"): StyleSpecification {
  const base = theme === "dark" ? "#0A0A0A" : "#F9F9F9";
  const line = theme === "dark" ? "#FFFFFF" : "#1A1A1A";

  return {
    ...style,
    sources: {
      ...style.sources,
      territory: {
        type: "geojson",
        data: emptyTerritoryCollection(),
        promoteId: "id",
      },
      trail: {
        type: "geojson",
        data: EMPTY_TRAIL,
      },
      accuracy: {
        type: "geojson",
        data: EMPTY_ACCURACY,
      },
    },
    layers: [
      ...style.layers,
      {
        id: "gps-accuracy",
        type: "fill",
        source: "accuracy",
        paint: {
          "fill-color": "#32D7FF",
          "fill-opacity": 0.13,
        },
      },
      {
        id: "gps-accuracy-line",
        type: "line",
        source: "accuracy",
        paint: {
          "line-color": "#32D7FF",
          "line-width": 1,
          "line-opacity": 0.42,
        },
      },
      {
        id: "territory-glow",
        type: "fill",
        source: "territory",
        paint: {
          "fill-color": "rgba(50,215,255,0.18)",
          "fill-opacity": 0.24,
        },
      },
      {
        id: "territory-fill",
        type: "fill",
        source: "territory",
        paint: {
          "fill-color": "#32D7FF",
          "fill-opacity": ["case", ["boolean", ["get", "contested"], false], 0.42, 0.58],
        },
      },
      {
        id: "territory-outline",
        type: "line",
        source: "territory",
        paint: {
          "line-color": "#FFFFFF",
          "line-width": ["case", ["boolean", ["feature-state", "selected"], false], 4, 1.5],
          "line-opacity": ["case", ["boolean", ["feature-state", "selected"], false], 0.95, 0.5],
        },
      },
      {
        id: "movement-trail-glow",
        type: "line",
        source: "trail",
        layout: {
          "line-cap": "round",
          "line-join": "round",
        },
        paint: {
          "line-color": "#FFFFFF",
          "line-width": ["interpolate", ["linear"], ["zoom"], 10, 16, 16, 40],
          "line-opacity": 0.15,
          "line-blur": 8,
        },
      },
      {
        id: "movement-trail",
        type: "line",
        source: "trail",
        layout: {
          "line-cap": "round",
          "line-join": "round",
        },
        paint: {
          "line-color": "#FFFFFF",
          "line-width": ["interpolate", ["linear"], ["zoom"], 10, 5, 16, 16],
          "line-opacity": 0.85,
          "line-blur": 0,
        },
      },
      {
        id: "movement-trail-outline",
        type: "line",
        source: "trail",
        layout: {
          "line-cap": "round",
          "line-join": "round",
        },
        paint: {
          "line-color": "#FFFFFF",
          "line-width": ["interpolate", ["linear"], ["zoom"], 10, 7, 16, 20],
          "line-opacity": 0.4,
          "line-gap-width": 0,
          "line-dasharray": [2, 3],
        },
      },
      {
        id: "outside-nepal-play-mask",
        type: "fill",
        source: "nepalMask",
        paint: {
          "fill-color": base,
          "fill-opacity": 0.98,
        },
      },
      {
        id: "nepal-play-boundary",
        type: "line",
        source: "nepalOutline",
        paint: {
          "line-color": line,
          "line-width": ["interpolate", ["linear"], ["zoom"], 5, 1.4, 10, 2.6],
          "line-opacity": 0.72,
        },
      },
    ],
  };
}

function syncTerritorySource(map: MlMap, patches = useGame.getState().territoryPatches) {
  const source = map.getSource("territory") as GeoJSONSource | undefined;
  source?.setData(patchesToFeatureCollection(patches));
}

function syncTrailSource(map: MlMap, trail = useGame.getState().movementTrail) {
  const source = map.getSource("trail") as GeoJSONSource | undefined;
  if (!source) return;
  if (trail.length < 2) {
    source.setData(EMPTY_TRAIL);
    return;
  }
  source.setData({
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: {},
        geometry: {
          type: "LineString",
          coordinates: trail.map((p) => [p.lng, p.lat]),
        },
      },
    ],
  });
}

function syncAccuracySource(map: MlMap, position = useGame.getState().position) {
  const source = map.getSource("accuracy") as GeoJSONSource | undefined;
  if (!source) return;
  if (!position?.accuracy) {
    source.setData(EMPTY_ACCURACY);
    return;
  }
  source.setData({
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: {},
        geometry: circlePolygon(position.lng, position.lat, Math.min(position.accuracy, 250)),
      },
    ],
  });
}

function syncOwnerPaint(map: MlMap, colors: Map<string, string>) {
  if (!map.getLayer("territory-fill")) return;
  const matchExpression: unknown[] = ["match", ["get", "ownerId"]];
  for (const [ownerId, color] of colors) {
    matchExpression.push(ownerId, color);
  }
  matchExpression.push("rgba(255,255,255,0.25)");
  map.setPaintProperty("territory-fill", "fill-color", matchExpression);
  map.setPaintProperty("territory-glow", "fill-color", matchExpression);
}

function buildOwnerColors() {
  const state = useGame.getState();
  const colors = new Map<string, string>();
  for (const entry of state.leaderboard) {
    colors.set(entry.player.id, TERRITORY_HEX[entry.player.color]);
  }
  if (state.user) colors.set(state.user.id, TERRITORY_HEX[state.user.color]);
  return colors;
}
