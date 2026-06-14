import { create } from 'zustand';
import type {
  LeaderboardEntry,
  Player,
  PlayerPosition,
  TerritoryColor,
  TerritoryPatch,
  ZoneOwnership,
} from './types';
import { evaluateAchievements, ACHIEVEMENTS } from './achievements';
import { pointInNepal } from './nepal-shape';
import {
  apiSendLocation,
  apiGetViewportZones,
  apiGetLeaderboard,
  apiLogin,
  apiRegister,
  apiGetProfile,
  connectSocket,
  disconnectSocket,
  getToken,
  setToken,
  registerServiceWorker,
  updateServiceWorkerToken,
  type ZoneData,
} from '../api';

const STORAGE_KEY = 'ntc:user';
const ACH_KEY = 'ntc:achievements';
const THEME_KEY = 'ntc:theme';
const CLAIM_RADIUS_METERS = 95;
const CLAIM_MIN_DISTANCE_METERS = 36;
const MAX_TERRITORY_PATCHES = 520;
const MAX_TRAIL_POINTS = 110;
const MAX_CLAIM_ACCURACY_METERS = 100; // Matches server-side anti-cheat (100m)

function loadUser(): Player | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Player) : null;
  } catch {
    return null;
  }
}

function saveUser(p: Player | null) {
  if (typeof window === 'undefined') return;
  if (p) localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
  else localStorage.removeItem(STORAGE_KEY);
}

function loadAchievements(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = localStorage.getItem(ACH_KEY);
    return raw ? new Set(JSON.parse(raw) as string[]) : new Set();
  } catch {
    return new Set();
  }
}

function saveAchievements(s: Set<string>) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(ACH_KEY, JSON.stringify(Array.from(s)));
}

function initialTheme(): 'light' | 'dark' {
  if (typeof window === 'undefined') return 'dark';
  try {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === 'light' || saved === 'dark') return saved;
  } catch {
    /* ignore */
  }
  return window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

function distanceMeters(a: PlayerPosition, b: PlayerPosition) {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.sqrt(x));
}

function latLngToCell(lat: number, lng: number): string {
  const latCell = Math.floor(lat / 0.001);
  const lngCell = Math.floor(lng / 0.001);
  return `${latCell}_${lngCell}`;
}

// Convert server zone data to local TerritoryPatch
function zoneToPatch(zone: ZoneData): TerritoryPatch {
  return {
    id: zone._id,
    ownerId: zone.ownerId,
    lng: zone.lng,
    lat: zone.lat,
    radiusMeters: CLAIM_RADIUS_METERS,
    contested: zone.contested,
    defense: 60,
    createdAt: zone.claimedAt ? new Date(zone.claimedAt).getTime() : Date.now(),
  };
}

export interface GameToast {
  id: string;
  type: 'info' | 'success' | 'warning';
  message: string;
  createdAt: number;
}

interface GameState {
  user: Player | null;
  theme: 'light' | 'dark';
  position: PlayerPosition | null;
  zones: Map<string, ZoneOwnership>;
  territoryPatches: TerritoryPatch[];
  movementTrail: PlayerPosition[];
  leaderboard: LeaderboardEntry[];
  selectedZoneId: string | null;
  unlockedAchievements: Set<string>;
  recentUnlock: string | null;
  isOnline: boolean;
  authError: string | null;

  // Advanced tracking
  loopsClosed: number;
  defendCount: number;
  lastLoopCapture: { cellIds: string[]; timestamp: number } | null;
  toasts: GameToast[];

  // Auth actions (real backend)
  login: (email: string, password: string) => Promise<{ ok: boolean; error?: string; errors?: Record<string, string> }>;
  register: (data: {
    email: string;
    password: string;
    username: string;
    emoji?: string;
    color?: string;
  }) => Promise<{ ok: boolean; error?: string; errors?: Record<string, string> }>;
  logout: () => void;
  restoreSession: () => Promise<void>;

  setUser: (p: Player | null) => void;
  setTheme: (t: 'light' | 'dark') => void;
  toggleTheme: () => void;
  setPosition: (p: PlayerPosition | null) => void;
  setSelectedZone: (id: string | null) => void;
  claimZone: (id: string) => void;
  claimCurrentPosition: (p: PlayerPosition) => void;
  hydrateMockState: () => void;
  simulateTick: () => void;
  checkAchievements: () => void;
  clearRecentUnlock: () => void;
  addToast: (type: GameToast['type'], message: string) => void;
  dismissToast: (id: string) => void;

  // Server-connected actions
  initSocket: () => void;
  fetchViewportZones: (bbox: { w: number; s: number; e: number; n: number }) => Promise<void>;
  fetchLeaderboard: () => Promise<void>;
}

export const useGame = create<GameState>((set, get) => ({
  user: loadUser(),
  theme: initialTheme(),
  position: null,
  zones: new Map(),
  territoryPatches: [],
  movementTrail: [],
  leaderboard: [],
  selectedZoneId: null,
  unlockedAchievements: loadAchievements(),
  recentUnlock: null,
  isOnline: true,
  authError: null,
  loopsClosed: 0,
  defendCount: 0,
  lastLoopCapture: null,
  toasts: [],

  // ═══════════════════════════════════════════════════════════════════
  // REAL AUTH (Backend API)
  // ═══════════════════════════════════════════════════════════════════

  login: async (email, password) => {
    const result = await apiLogin({ email, password });
    if (result.ok && result.data) {
      const userData = result.data as { user: { _id: string; username: string; emoji: string; color: TerritoryColor }; token: string };
      const player: Player = {
        id: userData.user._id,
        username: userData.user.username,
        avatar: userData.user.emoji,
        color: userData.user.color,
      };
      saveUser(player);
      set({ user: player, authError: null });
      updateServiceWorkerToken();
      get().initSocket();
      return { ok: true };
    }
    return { ok: false, error: result.error, errors: result.errors };
  },

  register: async (data) => {
    const result = await apiRegister(data);
    if (result.ok && result.data) {
      const userData = result.data as { user: { _id: string; username: string; emoji: string; color: TerritoryColor }; token: string };
      const player: Player = {
        id: userData.user._id,
        username: userData.user.username,
        avatar: userData.user.emoji,
        color: userData.user.color,
      };
      saveUser(player);
      set({ user: player, authError: null });
      updateServiceWorkerToken();
      get().initSocket();
      return { ok: true };
    }
    return { ok: false, error: result.error, errors: result.errors };
  },

  logout: () => {
    setToken(null);
    disconnectSocket();
    saveUser(null);
    set({
      user: null,
      zones: new Map(),
      territoryPatches: [],
      movementTrail: [],
      leaderboard: [],
      selectedZoneId: null,
      authError: null,
    });
  },

  restoreSession: async () => {
    const token = getToken();
    if (!token) return;
    try {
      const result = await apiGetProfile();
      if (result.ok && result.data) {
        const userData = result.data as { user: { _id: string; username: string; emoji: string; color: TerritoryColor } };
        const player: Player = {
          id: userData.user._id,
          username: userData.user.username,
          avatar: userData.user.emoji,
          color: userData.user.color,
        };
        saveUser(player);
        set({ user: player, authError: null });
        get().initSocket();
      } else {
        // Token expired or invalid — clean up
        setToken(null);
        saveUser(null);
        set({ user: null });
      }
    } catch {
      // Network error — keep existing local user but don't init socket
      console.warn('Failed to restore session, will retry later');
    }
  },

  initSocket: () => {
    connectSocket({
      onZonesCaptured: (data: unknown) => {
        const event = data as { userId: string; color: string; zones: ZoneData[] };
        const state = get();
        const zones = new Map(state.zones);
        const newPatches = [...state.territoryPatches];

        for (const zone of event.zones) {
          zones.set(zone._id, {
            ownerId: zone.ownerId,
            contested: false,
            defense: 60,
          });

          // Add/update patch
          const existingIdx = newPatches.findIndex((p) => p.id === zone._id);
          const patch = zoneToPatch(zone);
          if (existingIdx >= 0) {
            newPatches[existingIdx] = patch;
          } else {
            newPatches.push(patch);
          }
        }

        set({
          zones,
          territoryPatches: newPatches.slice(-MAX_TERRITORY_PATCHES),
        });
      },

      onZonesStolen: (data: unknown) => {
        const event = data as { byUserId: string; byColor: string; zoneIds: string[] };
        console.warn(`⚔️ ${event.zoneIds.length} zones stolen by another player!`);
      },

      onZoneUpdate: (data: unknown) => {
        const zone = data as ZoneData;
        const zones = new Map(get().zones);
        zones.set(zone._id, {
          ownerId: zone.ownerId,
          contested: zone.contested,
          defense: 60,
        });

        const patches = [...get().territoryPatches];
        const existingIdx = patches.findIndex((p) => p.id === zone._id);
        const patch = zoneToPatch(zone);
        if (existingIdx >= 0) {
          patches[existingIdx] = patch;
        } else {
          patches.push(patch);
        }

        set({
          zones,
          territoryPatches: patches.slice(-MAX_TERRITORY_PATCHES),
        });
      },

      onLeaderboardUpdate: (data: unknown) => {
        const event = data as { leaderboard: Array<{
          rank: number;
          userId: string;
          username: string;
          emoji: string;
          color: TerritoryColor;
          zones: number;
          areaKm2: number;
          points: number;
        }> };

        const leaderboard: LeaderboardEntry[] = event.leaderboard.map((e) => ({
          rank: e.rank,
          player: {
            id: e.userId,
            username: e.username,
            avatar: e.emoji,
            color: e.color,
          },
          zones: e.zones,
          areaKm2: e.areaKm2,
          points: e.points,
        }));

        set({ leaderboard });
      },

      onSeasonReset: (data: unknown) => {
        const event = data as { year: number; message: string };
        console.log('🎆 Season Reset:', event.message);
        set({
          zones: new Map(),
          territoryPatches: [],
          leaderboard: [],
        });
        alert(event.message);
      },
    });
  },

  // ═══════════════════════════════════════════════════════════════════
  // SERVER DATA FETCHING
  // ═══════════════════════════════════════════════════════════════════

  fetchViewportZones: async (bbox) => {
    const result = await apiGetViewportZones(bbox);
    if (result.ok && result.data) {
      const { zones: serverZones } = result.data;
      const zones = new Map(get().zones);
      const patches = [...get().territoryPatches];

      for (const sz of serverZones) {
        zones.set(sz._id, {
          ownerId: sz.ownerId,
          contested: sz.contested,
          defense: 60,
        });

        const existingIdx = patches.findIndex((p) => p.id === sz._id);
        const patch = zoneToPatch(sz);
        if (existingIdx >= 0) {
          patches[existingIdx] = patch;
        } else {
          patches.push(patch);
        }
      }

      set({
        zones,
        territoryPatches: patches.slice(-MAX_TERRITORY_PATCHES),
      });
    }
  },

  fetchLeaderboard: async () => {
    const result = await apiGetLeaderboard();
    if (result.ok && result.data) {
      const entries = result.data.leaderboard;
      const leaderboard: LeaderboardEntry[] = entries.map((e) => ({
        rank: e.rank,
        player: {
          id: e.userId,
          username: e.username,
          avatar: e.emoji,
          color: e.color as TerritoryColor,
        },
        zones: e.zones,
        areaKm2: e.areaKm2,
        points: e.points,
      }));
      set({ leaderboard });
    }
  },

  // ═══════════════════════════════════════════════════════════════════
  // EXISTING ACTIONS (updated to use backend)
  // ═══════════════════════════════════════════════════════════════════

  setUser: (p) => {
    saveUser(p);
    set({ user: p });
  },

  setTheme: (t) => {
    if (typeof document !== 'undefined') {
      document.documentElement.classList.toggle('dark', t === 'dark');
      try {
        localStorage.setItem(THEME_KEY, t);
      } catch {
        /* ignore */
      }
      const meta = document.querySelector('meta[name="theme-color"]');
      if (meta) meta.setAttribute('content', t === 'dark' ? '#0A0A0A' : '#F9F9F9');
    }
    set({ theme: t });
  },

  toggleTheme: () => {
    const next = get().theme === 'dark' ? 'light' : 'dark';
    get().setTheme(next);
  },

  setPosition: (p) => set({ position: p }),
  setSelectedZone: (id) => set({ selectedZoneId: id }),

  claimZone: (id) => {
    const user = get().user;
    if (!user) return;
    const zones = new Map(get().zones);
    zones.set(id, { ownerId: user.id, contested: false, defense: 60 + Math.random() * 30 });
    set({
      zones,
      territoryPatches: get().territoryPatches.map((patch) =>
        patch.id === id
          ? {
              ...patch,
              ownerId: user.id,
              contested: false,
              defense: 60 + Math.random() * 30,
            }
          : patch,
      ),
    });
    get().checkAchievements();
  },

  claimCurrentPosition: (p) => {
    const user = get().user;
    if (!user) return;
    if (!pointInNepal(p)) return;
    if (p.accuracy && p.accuracy > MAX_CLAIM_ACCURACY_METERS) return;

    const trail = get().movementTrail;
    const previous = trail[trail.length - 1];
    const distance = previous ? distanceMeters(previous, p) : CLAIM_MIN_DISTANCE_METERS;
    if (previous && distance < CLAIM_MIN_DISTANCE_METERS) return;

    // Check if we are inside our own territory
    const currentCellId = latLngToCell(p.lat, p.lng);
    const zone = get().zones.get(currentCellId);
    const isOwned = zone?.ownerId === user.id;

    // Update local trail: If inside own territory, reset the trail to just the current point
    set({
      movementTrail: isOwned ? [p] : [...trail, p].slice(-MAX_TRAIL_POINTS),
    });

    // Send to server (non-blocking — optimistic local update + server verification)
    apiSendLocation({
      lat: p.lat,
      lng: p.lng,
      accuracy: p.accuracy,
      timestamp: Date.now(),
    }).then((result) => {
      if (result.ok && result.data) {
        const data = result.data;
        if (data.loopClosed) {
          const newLoops = get().loopsClosed + 1;
          set({ movementTrail: [p], loopsClosed: newLoops, lastLoopCapture: { cellIds: [], timestamp: Date.now() } });
          get().addToast('success', `🔄 Loop closed! Captured ${data.totalEnclosed} cells`);
          // Clear flash after 2s
          setTimeout(() => set({ lastLoopCapture: null }), 2000);
        }
      } else if (result.error) {
        // Anti-cheat rejection or rate limit
        if (result.error.includes('ANTICHEAT') || result.error.includes('Velocity')) {
          console.warn('🚫 Anti-cheat:', result.error);
          set({ movementTrail: [p] });
          get().addToast('warning', '🚫 Location jump detected — trail reset');
        }
      }
    }).catch(() => {
      if (typeof navigator !== 'undefined' && navigator.serviceWorker?.controller) {
        navigator.serviceWorker.controller.postMessage({
          type: 'QUEUE_LOCATION',
          data: {
            lat: p.lat,
            lng: p.lng,
            accuracy: p.accuracy,
            timestamp: Date.now(),
          },
        });
        console.log('📶 Offline/Backgrounded: Queued location in Service Worker');
      }
    });

    get().checkAchievements();
  },

  hydrateMockState: () => {
    // In production mode, fetch real data from server
    const token = getToken();
    if (token) {
      get().restoreSession().then(() => {
        get().fetchLeaderboard();
      });
      registerServiceWorker();
      return;
    }

    // No token — user needs to log in, no mock state needed
  },

  simulateTick: () => {
    // In production mode, this is handled by Socket.io real-time updates
    // Only fetch leaderboard periodically
    const token = getToken();
    if (token) {
      get().fetchLeaderboard();
    }
  },

  checkAchievements: () => {
    const { user, zones, leaderboard, unlockedAchievements, loopsClosed, defendCount } = get();
    if (!user) return;
    const next = evaluateAchievements({ user, zones, leaderboard, loopsClosed, defendCount });
    let newest: string | null = null;
    for (const id of next) if (!unlockedAchievements.has(id)) newest = id;
    if (newest) {
      const merged = new Set([...unlockedAchievements, ...next]);
      saveAchievements(merged);
      set({ unlockedAchievements: merged, recentUnlock: newest });
      const ach = ACHIEVEMENTS.find(a => a.id === newest);
      if (ach) get().addToast('success', `🏆 Achievement unlocked: ${ach.title}`);
    }
  },

  clearRecentUnlock: () => set({ recentUnlock: null }),

  addToast: (type, message) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const toast: GameToast = { id, type, message, createdAt: Date.now() };
    set({ toasts: [...get().toasts, toast] });
    setTimeout(() => get().dismissToast(id), 4000);
  },

  dismissToast: (id) => {
    set({ toasts: get().toasts.filter((t) => t.id !== id) });
  },
}));
