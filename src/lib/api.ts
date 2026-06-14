/**
 * Nepal Territory Conquest — API Client
 *
 * Centralized HTTP + Socket.io client for communicating with the Express backend.
 * Used by the Zustand store and components.
 */

import { io as socketIO } from 'socket.io-client';

// ── Configuration ────────────────────────────────────────────────────
const API_URL = import.meta.env.VITE_API_URL || (typeof window !== 'undefined' ? `http://${window.location.hostname}:3001` : 'http://localhost:3001');
const TOKEN_KEY = 'ntc:token';

// ── Token management ─────────────────────────────────────────────────
export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null) {
  if (typeof window === 'undefined') return;
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

// ── HTTP helpers ─────────────────────────────────────────────────────
async function apiFetch<T = unknown>(
  path: string,
  options: RequestInit = {},
): Promise<{ ok: boolean; data?: T; error?: string; errors?: Record<string, string> }> {
  const token = getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  try {
    const res = await fetch(`${API_URL}${path}`, {
      ...options,
      headers,
    });
    const data = await res.json();
    if (!res.ok) {
      return { ok: false, error: data.error, errors: data.errors };
    }
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: (err as Error).message || 'Network error' };
  }
}

// ── Auth API ─────────────────────────────────────────────────────────

export interface AuthResponse {
  ok: boolean;
  token: string;
  user: {
    _id: string;
    username: string;
    email: string;
    emoji: string;
    color: string;
  };
}

export async function apiRegister(body: {
  email: string;
  password: string;
  username: string;
  emoji?: string;
  color?: string;
}) {
  const result = await apiFetch<AuthResponse>('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify(body),
  });
  if (result.ok && result.data?.token) {
    setToken(result.data.token);
  }
  return result;
}

export async function apiLogin(body: { email: string; password: string }) {
  const result = await apiFetch<AuthResponse>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify(body),
  });
  if (result.ok && result.data?.token) {
    setToken(result.data.token);
  }
  return result;
}

export async function apiGetProfile() {
  return apiFetch('/api/auth/profile');
}

// ── Game API ─────────────────────────────────────────────────────────

export interface LocationResponse {
  ok: boolean;
  cell: string;
  captured: number;
  stolen: number;
  loopClosed: boolean;
  totalEnclosed: number;
}

export async function apiSendLocation(body: {
  lat: number;
  lng: number;
  accuracy?: number;
  timestamp?: number;
}) {
  return apiFetch<LocationResponse>('/api/game/location', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function apiSendLocationBatch(updates: Array<{
  lat: number;
  lng: number;
  accuracy?: number;
  timestamp?: number;
}>) {
  return apiFetch('/api/game/location/batch', {
    method: 'POST',
    body: JSON.stringify({ updates }),
  });
}

export interface ZoneData {
  _id: string;
  lat: number;
  lng: number;
  ownerId: string;
  color: string;
  contested: boolean;
  claimedAt: string;
}

export async function apiGetViewportZones(bbox: {
  w: number;
  s: number;
  e: number;
  n: number;
  limit?: number;
}) {
  const params = new URLSearchParams({
    w: String(bbox.w),
    s: String(bbox.s),
    e: String(bbox.e),
    n: String(bbox.n),
    ...(bbox.limit ? { limit: String(bbox.limit) } : {}),
  });
  return apiFetch<{ zones: ZoneData[]; count: number }>(`/api/game/zones?${params}`);
}

export interface LeaderboardEntry {
  rank: number;
  userId: string;
  username: string;
  emoji: string;
  color: string;
  zones: number;
  areaKm2: number;
  points: number;
}

export async function apiGetLeaderboard(limit = 50) {
  return apiFetch<{ leaderboard: LeaderboardEntry[] }>(`/api/game/leaderboard?limit=${limit}`);
}

export async function apiDefendZone(body: { zoneId: string; lat?: number; lng?: number }) {
  return apiFetch('/api/game/defend', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function apiGetGameStats() {
  return apiFetch('/api/game/stats');
}

// ── Socket.io Client ─────────────────────────────────────────────────

let socket: ReturnType<typeof socketIO> | null = null;

export function getSocket() {
  return socket;
}

export function connectSocket(onEvents?: {
  onZonesCaptured?: (data: unknown) => void;
  onZonesStolen?: (data: unknown) => void;
  onZoneUpdate?: (data: unknown) => void;
  onLeaderboardUpdate?: (data: unknown) => void;
  onSeasonReset?: (data: unknown) => void;
  onZonesDecayed?: (data: unknown) => void;
}) {
  if (socket?.connected) return socket;

  const token = getToken();
  socket = socketIO(API_URL, {
    auth: { token },
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionAttempts: 10,
  });

  socket.on('connect', () => {
    console.log('🔌 Socket.io connected:', socket?.id);
  });

  socket.on('disconnect', (reason) => {
    console.log('🔌 Socket.io disconnected:', reason);
  });

  socket.on('connect_error', (err) => {
    console.warn('🔌 Socket.io connection error:', err.message);
  });

  // ── Game events ────────────────────────────────────────────────
  if (onEvents?.onZonesCaptured) {
    socket.on('zones_captured', onEvents.onZonesCaptured);
  }
  if (onEvents?.onZonesStolen) {
    socket.on('zones_stolen', onEvents.onZonesStolen);
  }
  if (onEvents?.onZoneUpdate) {
    socket.on('zone_update', onEvents.onZoneUpdate);
  }
  if (onEvents?.onLeaderboardUpdate) {
    socket.on('leaderboard_update', onEvents.onLeaderboardUpdate);
  }
  if (onEvents?.onSeasonReset) {
    socket.on('season_reset', onEvents.onSeasonReset);
  }
  if (onEvents?.onZonesDecayed) {
    socket.on('zones_decayed', onEvents.onZonesDecayed);
  }

  return socket;
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}

export function emitViewportChange(bbox: { w: number; s: number; e: number; n: number }) {
  socket?.emit('viewport_change', bbox);
}

// ── Service Worker Registration ──────────────────────────────────────

export async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) {
    console.warn('Service Workers not supported');
    return null;
  }

  try {
    const registration = await navigator.serviceWorker.register('/sw.js', {
      scope: '/',
    });
    console.log('✅ Service Worker registered:', registration.scope);

    // Pass auth token to Service Worker
    const token = getToken();
    if (token && registration.active) {
      registration.active.postMessage({
        type: 'SET_AUTH_TOKEN',
        data: { token, apiUrl: API_URL },
      });
    }

    // Listen for token updates when SW activates
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      const t = getToken();
      if (t) {
        navigator.serviceWorker.controller?.postMessage({
          type: 'SET_AUTH_TOKEN',
          data: { token: t, apiUrl: API_URL },
        });
      }
    });

    // Register periodic background sync if available
    if ('periodicSync' in registration) {
      try {
        await (registration as unknown as { periodicSync: { register: (tag: string, options: { minInterval: number }) => Promise<void> } }).periodicSync.register('location-periodic-sync', {
          minInterval: 60_000, // 1 minute minimum
        });
        console.log('✅ Periodic Background Sync registered');
      } catch {
        console.log('ℹ️  Periodic Background Sync not available');
      }
    }

    // Listen for messages from Service Worker
    navigator.serviceWorker.addEventListener('message', (event) => {
      const { type, count } = event.data || {};
      if (type === 'SYNC_COMPLETE') {
        console.log(`✅ Background sync: ${count} queued locations flushed`);
      }
    });

    return registration;
  } catch (err) {
    console.error('Service Worker registration failed:', err);
    return null;
  }
}

export function updateServiceWorkerToken() {
  const token = getToken();
  if (token && navigator.serviceWorker?.controller) {
    navigator.serviceWorker.controller.postMessage({
      type: 'SET_AUTH_TOKEN',
      data: { token, apiUrl: API_URL },
    });
  }
}

export { API_URL };
