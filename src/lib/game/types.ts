export type TerritoryColor = "crimson" | "cyan" | "volt" | "magenta" | "amber" | "violet";

export const TERRITORY_HEX: Record<TerritoryColor, string> = {
  crimson: "#FF3B30",
  cyan: "#32D7FF",
  volt: "#34C759",
  magenta: "#FF2D92",
  amber: "#FFB300",
  violet: "#AF52DE",
};

export interface Player {
  id: string;
  username: string;
  avatar: string; // emoji
  color: TerritoryColor;
}

export interface PlayerPosition {
  lng: number;
  lat: number;
  accuracy?: number;
}

export interface ZoneOwnership {
  ownerId: string;
  contested: boolean;
  defense: number; // 0..100
}

export interface TerritoryPatch {
  id: string;
  ownerId: string;
  lng: number;
  lat: number;
  radiusMeters: number;
  contested: boolean;
  defense: number;
  createdAt: number;
}

export interface LeaderboardEntry {
  rank: number;
  player: Player;
  zones: number;
  areaKm2: number;
  points: number;
}
