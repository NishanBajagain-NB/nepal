/**
 * Nepal Territory Conquest — Service Worker
 *
 * Provides:
 *   1. Background geolocation tracking via watchPosition
 *   2. Location update queuing in IndexedDB when offline/backgrounded
 *   3. Background Sync API to flush queued updates when connectivity returns
 *   4. App shell caching for offline access
 *
 * ⚠️  IMPORTANT: Users must grant "Always Allow" location permission
 * and exclude this app from battery optimization for reliable background tracking.
 */

const CACHE_NAME = 'ntc-v1';
const API_BASE = self.registration?.scope?.replace(/\/$/, '') || '';
const LOCATION_QUEUE_STORE = 'location-queue';
const DB_NAME = 'ntc-sw-db';
const DB_VERSION = 1;

// ── IndexedDB helpers ────────────────────────────────────────────────

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(LOCATION_QUEUE_STORE)) {
        db.createObjectStore(LOCATION_QUEUE_STORE, {
          keyPath: 'id',
          autoIncrement: true,
        });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function enqueueLocation(update) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(LOCATION_QUEUE_STORE, 'readwrite');
    const store = tx.objectStore(LOCATION_QUEUE_STORE);
    store.add(update);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function drainLocationQueue() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(LOCATION_QUEUE_STORE, 'readwrite');
    const store = tx.objectStore(LOCATION_QUEUE_STORE);
    const getAll = store.getAll();
    getAll.onsuccess = () => {
      const items = getAll.result;
      // Clear the store
      store.clear();
      tx.oncomplete = () => resolve(items);
    };
    tx.onerror = () => reject(tx.error);
  });
}

// ── Auth token storage ───────────────────────────────────────────────

let authToken = null;
let apiUrl = null;

// ── Service Worker Lifecycle ─────────────────────────────────────────

self.addEventListener('install', (event) => {
  console.log('[SW] Installing Nepal Territory Conquest Service Worker');
  self.skipWaiting();

  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // Cache essential app shell files
      return cache.addAll(['/']);
    }).catch(() => {
      // Non-critical — offline caching is a bonus
    }),
  );
});

self.addEventListener('activate', (event) => {
  console.log('[SW] Activating Service Worker');
  event.waitUntil(
    Promise.all([
      // Clean up old caches
      caches.keys().then((keys) =>
        Promise.all(
          keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)),
        ),
      ),
      // Take control of all clients immediately
      self.clients.claim(),
    ]),
  );
});

// ── Message handler: receive config from main thread ─────────────────

self.addEventListener('message', (event) => {
  const { type, data } = event.data || {};

  switch (type) {
    case 'SET_AUTH_TOKEN':
      authToken = data.token;
      apiUrl = data.apiUrl;
      console.log('[SW] Auth token updated');
      break;

    case 'START_TRACKING':
      startBackgroundTracking();
      break;

    case 'STOP_TRACKING':
      stopBackgroundTracking();
      break;

    case 'QUEUE_LOCATION':
      // Manually queue a location from the main thread
      enqueueLocation(data).catch(console.error);
      break;

    default:
      break;
  }
});

// ── Background Geolocation Tracking ──────────────────────────────────

let watchId = null;

function startBackgroundTracking() {
  if (watchId !== null) return; // Already tracking
  if (!('geolocation' in navigator)) {
    console.warn('[SW] Geolocation API not available in Service Worker scope');
    return;
  }

  console.log('[SW] Starting background geolocation tracking');

  watchId = navigator.geolocation.watchPosition(
    async (position) => {
      const update = {
        lat: position.coords.latitude,
        lng: position.coords.longitude,
        accuracy: position.coords.accuracy,
        timestamp: position.timestamp || Date.now(),
        queuedAt: Date.now(),
      };

      // Try to send immediately
      const sent = await sendLocationUpdate(update);
      if (!sent) {
        // Queue for later sync
        await enqueueLocation(update);
        // Register background sync
        if (self.registration.sync) {
          try {
            await self.registration.sync.register('location-sync');
          } catch {
            // Background Sync not supported — will retry on next activation
          }
        }
      }
    },
    (error) => {
      console.warn('[SW] Geolocation error:', error.message);
    },
    {
      enableHighAccuracy: true,
      maximumAge: 5000,
      timeout: 30000,
    },
  );
}

function stopBackgroundTracking() {
  if (watchId !== null && 'geolocation' in navigator) {
    navigator.geolocation.clearWatch(watchId);
    watchId = null;
    console.log('[SW] Background tracking stopped');
  }
}

// ── Send location to server ──────────────────────────────────────────

async function sendLocationUpdate(update) {
  if (!authToken || !apiUrl) return false;

  try {
    const response = await fetch(`${apiUrl}/api/game/location`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify(update),
    });
    return response.ok;
  } catch {
    return false;
  }
}

async function sendBatchUpdates(updates) {
  if (!authToken || !apiUrl || updates.length === 0) return false;

  try {
    const response = await fetch(`${apiUrl}/api/game/location/batch`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({ updates }),
    });
    return response.ok;
  } catch {
    return false;
  }
}

// ── Background Sync handler ──────────────────────────────────────────

self.addEventListener('sync', (event) => {
  if (event.tag === 'location-sync') {
    console.log('[SW] Background Sync triggered: flushing location queue');
    event.waitUntil(flushLocationQueue());
  }
});

async function flushLocationQueue() {
  try {
    const queued = await drainLocationQueue();
    if (queued.length === 0) return;

    console.log(`[SW] Flushing ${queued.length} queued location updates`);

    // Sort by timestamp and send as batch
    queued.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));

    const success = await sendBatchUpdates(queued);
    if (!success) {
      // Re-queue if send failed
      for (const update of queued) {
        await enqueueLocation(update);
      }
      console.warn('[SW] Batch send failed, re-queued updates');
    } else {
      console.log(`[SW] Successfully flushed ${queued.length} updates`);

      // Notify connected clients
      const clients = await self.clients.matchAll();
      for (const client of clients) {
        client.postMessage({
          type: 'SYNC_COMPLETE',
          count: queued.length,
        });
      }
    }
  } catch (err) {
    console.error('[SW] Flush error:', err);
  }
}

// ── Periodic Background Sync (for continuous capture) ────────────────

self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'location-periodic-sync') {
    event.waitUntil(flushLocationQueue());
  }
});

// ── Fetch handler: app shell caching ─────────────────────────────────

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Don't cache API requests
  if (request.url.includes('/api/')) return;

  // Network-first with cache fallback for navigation
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Cache successful navigation responses
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => caches.match(request).then((cached) => cached || caches.match('/'))),
    );
    return;
  }

  // Cache-first for static assets
  if (
    request.destination === 'style' ||
    request.destination === 'script' ||
    request.destination === 'image' ||
    request.destination === 'font'
  ) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((response) => {
            if (response.ok) {
              const clone = response.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
            }
            return response;
          }),
      ),
    );
  }
});
