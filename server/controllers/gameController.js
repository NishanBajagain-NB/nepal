import Zone from '../models/Zone.js';
import Claim from '../models/Claim.js';
import User from '../models/User.js';
import {
  checkConquestRate,
  recordConquest,
  checkDefendCooldown,
  recordDefend,
} from '../middleware/rateLimiter.js';

// ── Constants ────────────────────────────────────────────────────────
const CELL_DEG = 0.001; // ~100m grid cells
const EARTH_RADIUS_M = 6_371_000;
const MAX_ACCURACY_M = 100; // reject GPS readings worse than 100m
const MAX_SPEED_KMH = 60; // anti-spoof velocity cap
const MAX_SPEED_MS = MAX_SPEED_KMH / 3.6; // ~16.67 m/s
const CLAIM_RADIUS_M = 80; // max distance from cell center to claim
const MIN_TRAIL_POINTS_FOR_LOOP = 4; // minimum points to form a closed loop
const MAX_VIEWPORT_ZONES = 2000;

// ── In-memory player state ───────────────────────────────────────────
// Maps userId → { trail: [{lat,lng,ts}], lastUpdate: {lat,lng,ts} }
const playerStates = new Map();

// Cleanup idle players every 10 minutes
setInterval(() => {
  const cutoff = Date.now() - 30 * 60_000; // 30 min idle
  for (const [uid, state] of playerStates) {
    if (state.lastUpdate && state.lastUpdate.ts < cutoff) {
      playerStates.delete(uid);
    }
  }
}, 600_000);

// ═══════════════════════════════════════════════════════════════════════
// HAVERSINE DISTANCE
// ═══════════════════════════════════════════════════════════════════════
export function haversineDistance(lat1, lng1, lat2, lng2) {
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(a));
}

// ═══════════════════════════════════════════════════════════════════════
// GRID CELL UTILITIES
// ═══════════════════════════════════════════════════════════════════════

/**
 * Convert lat/lng to deterministic cell ID.
 * Format: "27717_85324" (lat * 1000 rounded)_(lng * 1000 rounded)
 */
export function latLngToCell(lat, lng) {
  const latCell = Math.floor(lat / CELL_DEG);
  const lngCell = Math.floor(lng / CELL_DEG);
  return `${latCell}_${lngCell}`;
}

/**
 * Get the center lat/lng of a cell from its ID.
 */
export function getCellCenter(cellId) {
  const [latStr, lngStr] = cellId.split('_');
  const latCell = parseInt(latStr, 10);
  const lngCell = parseInt(lngStr, 10);
  return {
    lat: latCell * CELL_DEG + CELL_DEG / 2,
    lng: lngCell * CELL_DEG + CELL_DEG / 2,
  };
}

/**
 * Get all cell IDs along a line between two points (Bresenham-style on grid).
 */
function getCellsAlongLine(lat1, lng1, lat2, lng2) {
  const cells = [];
  const startLatCell = Math.floor(lat1 / CELL_DEG);
  const startLngCell = Math.floor(lng1 / CELL_DEG);
  const endLatCell = Math.floor(lat2 / CELL_DEG);
  const endLngCell = Math.floor(lng2 / CELL_DEG);

  const dLat = Math.abs(endLatCell - startLatCell);
  const dLng = Math.abs(endLngCell - startLngCell);
  const sLat = startLatCell < endLatCell ? 1 : -1;
  const sLng = startLngCell < endLngCell ? 1 : -1;

  let err = dLat - dLng;
  let curLat = startLatCell;
  let curLng = startLngCell;

  while (true) {
    cells.push(`${curLat}_${curLng}`);
    if (curLat === endLatCell && curLng === endLngCell) break;
    const e2 = 2 * err;
    if (e2 > -dLng) {
      err -= dLng;
      curLat += sLat;
    }
    if (e2 < dLat) {
      err += dLat;
      curLng += sLng;
    }
  }
  return cells;
}

// ═══════════════════════════════════════════════════════════════════════
// ANTI-CHEAT VALIDATION
// ═══════════════════════════════════════════════════════════════════════

/**
 * Validate an incoming location payload against anti-cheat rules.
 * Returns { valid: boolean, reason?: string }
 */
export function validateLocation(lat, lng, accuracy, timestamp, previousUpdate) {
  // 1. GPS accuracy check
  if (accuracy !== undefined && accuracy !== null && accuracy > MAX_ACCURACY_M) {
    return { valid: false, reason: `GPS accuracy too low: ${accuracy}m (max ${MAX_ACCURACY_M}m)` };
  }

  // 2. Basic coordinate range validation
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return { valid: false, reason: 'Coordinates out of valid range' };
  }

  // 3. Nepal boundary check (rough bounding box)
  if (lat < 26.3 || lat > 30.5 || lng < 80.0 || lng > 88.3) {
    return { valid: false, reason: 'Coordinates outside Nepal boundary' };
  }

  // 4. Velocity sanity check (compare with previous update)
  if (previousUpdate && timestamp) {
    const timeDeltaS = (timestamp - previousUpdate.ts) / 1000;
    if (timeDeltaS > 0) {
      const distM = haversineDistance(previousUpdate.lat, previousUpdate.lng, lat, lng);
      const speedMS = distM / timeDeltaS;
      if (speedMS > MAX_SPEED_MS) {
        return {
          valid: false,
          reason: `Velocity check failed: ${(speedMS * 3.6).toFixed(1)} km/h exceeds ${MAX_SPEED_KMH} km/h limit — possible GPS spoofing`,
        };
      }
    }
  }

  return { valid: true };
}

// ═══════════════════════════════════════════════════════════════════════
// PAPER.IO LOOP DETECTION & POLYGON FILL
// ═══════════════════════════════════════════════════════════════════════

/**
 * Check if a trail forms a closed loop.
 * A loop is closed when the latest point is in a cell that the player already owns,
 * and there are enough trail points to form a polygon.
 */
async function checkLoopClosure(trail, userId) {
  if (trail.length < MIN_TRAIL_POINTS_FOR_LOOP) return null;

  const lastPoint = trail[trail.length - 1];
  const lastCell = latLngToCell(lastPoint.lat, lastPoint.lng);

  // Check if we're back on owned territory
  const ownedZone = await Zone.findOne({ _id: lastCell, ownerId: userId }).lean();
  if (!ownedZone) {
    // Also check if trail self-intersects (closes on itself)
    const firstCell = latLngToCell(trail[0].lat, trail[0].lng);
    if (lastCell === firstCell && trail.length >= MIN_TRAIL_POINTS_FOR_LOOP) {
      return trail.map((p) => ({ lat: p.lat, lng: p.lng }));
    }
    return null;
  }

  // We're back on owned territory — the trail forms a closed polygon
  return trail.map((p) => ({ lat: p.lat, lng: p.lng }));
}

/**
 * Ray-casting point-in-polygon test.
 */
function pointInPolygon(lat, lng, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].lng;
    const yi = polygon[i].lat;
    const xj = polygon[j].lng;
    const yj = polygon[j].lat;
    const intersects = yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

/**
 * Compute all grid cell IDs whose centers fall inside the given polygon.
 * Uses scanline approach: find bounding box, iterate all cells, test each.
 */
export function computeEnclosedCells(polygon) {
  if (polygon.length < 3) return [];

  // Find bounding box
  let minLat = Infinity,
    maxLat = -Infinity,
    minLng = Infinity,
    maxLng = -Infinity;
  for (const p of polygon) {
    if (p.lat < minLat) minLat = p.lat;
    if (p.lat > maxLat) maxLat = p.lat;
    if (p.lng < minLng) minLng = p.lng;
    if (p.lng > maxLng) maxLng = p.lng;
  }

  // Quantize to grid
  const startLatCell = Math.floor(minLat / CELL_DEG);
  const endLatCell = Math.floor(maxLat / CELL_DEG);
  const startLngCell = Math.floor(minLng / CELL_DEG);
  const endLngCell = Math.floor(maxLng / CELL_DEG);

  // Safety: cap at ~10,000 cells to prevent abuse
  const cellCount = (endLatCell - startLatCell + 1) * (endLngCell - startLngCell + 1);
  if (cellCount > 10000) {
    return []; // Trail too large, likely spoofed
  }

  const enclosed = [];
  for (let latCell = startLatCell; latCell <= endLatCell; latCell++) {
    for (let lngCell = startLngCell; lngCell <= endLngCell; lngCell++) {
      const centerLat = latCell * CELL_DEG + CELL_DEG / 2;
      const centerLng = lngCell * CELL_DEG + CELL_DEG / 2;
      if (pointInPolygon(centerLat, centerLng, polygon)) {
        enclosed.push(`${latCell}_${lngCell}`);
      }
    }
  }
  return enclosed;
}

// ═══════════════════════════════════════════════════════════════════════
// ZONE CAPTURE
// ═══════════════════════════════════════════════════════════════════════

/**
 * Bulk capture zones for a player. Handles ownership transitions.
 * Returns { captured: string[], stolen: string[] }
 */
async function captureZones(userId, userColor, cellIds, io) {
  if (cellIds.length === 0) return { captured: [], stolen: [] };

  const now = new Date();
  const captured = [];
  const stolen = [];

  // Find existing zones to check previous ownership
  const existingZones = await Zone.find({ _id: { $in: cellIds } }).lean();
  const existingMap = new Map(existingZones.map((z) => [z._id, z]));

  // Prepare bulk operations
  const bulkOps = [];
  const claimDocs = [];

  for (const cellId of cellIds) {
    const center = getCellCenter(cellId);
    const existing = existingMap.get(cellId);

    const wasOwnedByOther =
      existing && existing.ownerId && existing.ownerId.toString() !== userId;

    bulkOps.push({
      updateOne: {
        filter: { _id: cellId },
        update: {
          $set: {
            lat: center.lat,
            lng: center.lng,
            ownerId: userId,
            color: userColor,
            contested: false,
            claimedAt: now,
          },
        },
        upsert: true,
      },
    });

    claimDocs.push({
      userId,
      zoneId: cellId,
      action: wasOwnedByOther ? 'conquer' : 'conquer',
      coordinates: [center.lat, center.lng],
      createdAt: now,
    });

    captured.push(cellId);
    if (wasOwnedByOther) {
      stolen.push(cellId);

      // Log 'lose' for the previous owner
      claimDocs.push({
        userId: existing.ownerId,
        zoneId: cellId,
        action: 'lose',
        coordinates: [center.lat, center.lng],
        createdAt: now,
      });
    }
  }

  // Execute bulk operations
  if (bulkOps.length > 0) {
    await Zone.bulkWrite(bulkOps, { ordered: false });
  }

  // Log claims (non-blocking)
  if (claimDocs.length > 0) {
    Claim.insertMany(claimDocs, { ordered: false }).catch((err) =>
      console.error('Failed to log claims:', err.message),
    );
  }

  // Emit real-time updates via Socket.io
  if (io && captured.length > 0) {
    const captureEvent = {
      userId,
      color: userColor,
      zones: captured.map((cellId) => {
        const center = getCellCenter(cellId);
        return { _id: cellId, lat: center.lat, lng: center.lng, color: userColor, ownerId: userId };
      }),
    };
    io.emit('zones_captured', captureEvent);

    // Notify individual stolen zones for affected players
    if (stolen.length > 0) {
      const affectedOwners = new Set(
        stolen
          .map((id) => existingMap.get(id)?.ownerId?.toString())
          .filter(Boolean),
      );
      for (const ownerId of affectedOwners) {
        io.to(`user:${ownerId}`).emit('zones_stolen', {
          byUserId: userId,
          byColor: userColor,
          zoneIds: stolen.filter(
            (id) => existingMap.get(id)?.ownerId?.toString() === ownerId,
          ),
        });
      }
    }
  }

  return { captured, stolen };
}

// ═══════════════════════════════════════════════════════════════════════
// API HANDLERS
// ═══════════════════════════════════════════════════════════════════════

/**
 * POST /api/game/location
 * Process a location update: validate, track trail, detect loops, capture zones.
 */
export async function handleLocationUpdate(req, res) {
  try {
    const { userId, color } = req.user;
    const { lat, lng, accuracy, timestamp } = req.body;

    // ── Input validation ───────────────────────────────────────────
    if (typeof lat !== 'number' || typeof lng !== 'number') {
      return res.status(400).json({ ok: false, error: 'lat and lng must be numbers' });
    }
    const ts = timestamp || Date.now();

    // ── Get or create player state ─────────────────────────────────
    if (!playerStates.has(userId)) {
      playerStates.set(userId, { trail: [], lastUpdate: null });
    }
    const state = playerStates.get(userId);

    // ── Anti-cheat validation ──────────────────────────────────────
    const validation = validateLocation(lat, lng, accuracy, ts, state.lastUpdate);
    if (!validation.valid) {
      if (validation.reason.includes('Velocity')) {
        // If the user teleported or drove too fast, we reject the update to prevent cheating,
        // BUT we MUST reset their location so they aren't permanently locked out at their new destination.
        // We also clear their trail so they don't draw a massive polygon.
        state.lastUpdate = { lat, lng, ts };
        state.trail = [{ lat, lng, ts }];
      }
      return res.status(403).json({ ok: false, error: validation.reason, code: 'ANTICHEAT' });
    }

    // ── Rate limit check ───────────────────────────────────────────
    const rateCheck = checkConquestRate(userId);
    if (!rateCheck.allowed) {
      return res.status(429).json({
        ok: false,
        error: 'Rate limit exceeded',
        retryAfterMs: rateCheck.retryAfterMs,
      });
    }

    // ── Update player state ────────────────────────────────────────
    const point = { lat, lng, ts };
    state.lastUpdate = point;
    state.trail.push(point);

    // Cap trail length to prevent memory abuse
    if (state.trail.length > 500) {
      state.trail = state.trail.slice(-500);
    }

    // ── Claim the cell the player is standing on ───────────────────
    const currentCell = latLngToCell(lat, lng);
    const cellCenter = getCellCenter(currentCell);
    const distToCenter = haversineDistance(lat, lng, cellCenter.lat, cellCenter.lng);

    // Also claim cells along the path from last position
    const directCaptures = [currentCell];
    if (state.trail.length >= 2) {
      const prev = state.trail[state.trail.length - 2];
      const pathCells = getCellsAlongLine(prev.lat, prev.lng, lat, lng);
      for (const c of pathCells) {
        if (!directCaptures.includes(c)) directCaptures.push(c);
      }
    }

    // ── Check for loop closure ─────────────────────────────────────
    const polygon = await checkLoopClosure(state.trail, userId);
    let loopCaptures = [];

    if (polygon) {
      // Compute enclosed cells
      const enclosedCells = computeEnclosedCells(polygon);
      loopCaptures = enclosedCells;

      // Clear the trail after loop closure
      state.trail = [point];
    }

    // ── Combine all cells to capture ───────────────────────────────
    const allCells = [...new Set([...directCaptures, ...loopCaptures])];

    // ── Perform capture ────────────────────────────────────────────
    const io = req.app.get('io');
    const result = await captureZones(userId, color, allCells, io);

    // Record rate limit
    for (let i = 0; i < result.captured.length; i++) {
      recordConquest(userId);
    }

    return res.json({
      ok: true,
      cell: currentCell,
      captured: result.captured.length,
      stolen: result.stolen.length,
      loopClosed: polygon !== null,
      totalEnclosed: loopCaptures.length,
    });
  } catch (err) {
    console.error('Location update error:', err);
    return res.status(500).json({ ok: false, error: 'Internal server error' });
  }
}

/**
 * POST /api/game/location/batch
 * Process a batch of queued location updates (from Service Worker Background Sync).
 */
export async function handleBatchLocationUpdate(req, res) {
  try {
    const { userId, color } = req.user;
    const { updates } = req.body;

    if (!Array.isArray(updates) || updates.length === 0) {
      return res.status(400).json({ ok: false, error: 'updates must be a non-empty array' });
    }

    // Cap at 100 updates per batch
    const batch = updates.slice(0, 100);
    let totalCaptured = 0;
    let totalStolen = 0;

    // Get or create player state
    if (!playerStates.has(userId)) {
      playerStates.set(userId, { trail: [], lastUpdate: null });
    }
    const state = playerStates.get(userId);
    const io = req.app.get('io');

    for (const update of batch) {
      const { lat, lng, accuracy, timestamp } = update;
      if (typeof lat !== 'number' || typeof lng !== 'number') continue;

      const ts = timestamp || Date.now();
      const validation = validateLocation(lat, lng, accuracy, ts, state.lastUpdate);
      if (!validation.valid) continue; // Skip invalid updates silently in batch mode

      const point = { lat, lng, ts };
      state.lastUpdate = point;
      state.trail.push(point);
      if (state.trail.length > 500) state.trail = state.trail.slice(-500);

      const currentCell = latLngToCell(lat, lng);
      const directCaptures = [currentCell];

      if (state.trail.length >= 2) {
        const prev = state.trail[state.trail.length - 2];
        const pathCells = getCellsAlongLine(prev.lat, prev.lng, lat, lng);
        for (const c of pathCells) {
          if (!directCaptures.includes(c)) directCaptures.push(c);
        }
      }

      const polygon = await checkLoopClosure(state.trail, userId);
      let loopCaptures = [];
      if (polygon) {
        loopCaptures = computeEnclosedCells(polygon);
        state.trail = [point];
      }

      const allCells = [...new Set([...directCaptures, ...loopCaptures])];
      const result = await captureZones(userId, color, allCells, io);
      totalCaptured += result.captured.length;
      totalStolen += result.stolen.length;
    }

    return res.json({
      ok: true,
      processed: batch.length,
      captured: totalCaptured,
      stolen: totalStolen,
    });
  } catch (err) {
    console.error('Batch location update error:', err);
    return res.status(500).json({ ok: false, error: 'Internal server error' });
  }
}

/**
 * GET /api/game/zones?w=&s=&e=&n=&limit=
 * Get zones within a bounding box for map rendering.
 */
export async function getViewportZones(req, res) {
  try {
    const w = parseFloat(req.query.w); // west lng
    const s = parseFloat(req.query.s); // south lat
    const e = parseFloat(req.query.e); // east lng
    const n = parseFloat(req.query.n); // north lat
    const limit = Math.min(parseInt(req.query.limit) || MAX_VIEWPORT_ZONES, MAX_VIEWPORT_ZONES);

    if ([w, s, e, n].some(isNaN)) {
      return res.status(400).json({ ok: false, error: 'w, s, e, n query params required (numbers)' });
    }

    const zones = await Zone.find({
      lat: { $gte: s, $lte: n },
      lng: { $gte: w, $lte: e },
      ownerId: { $ne: null },
    })
      .select('_id lat lng ownerId color contested claimedAt')
      .limit(limit)
      .lean();

    return res.json({ ok: true, zones, count: zones.length });
  } catch (err) {
    console.error('Viewport zones error:', err);
    return res.status(500).json({ ok: false, error: 'Internal server error' });
  }
}

/**
 * GET /api/game/leaderboard?limit=50
 * Get the current leaderboard (aggregated zone counts + points).
 */
export async function getLeaderboard(req, res) {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 50, 100);

    const leaderboard = await Zone.aggregate([
      { $match: { ownerId: { $ne: null } } },
      {
        $group: {
          _id: '$ownerId',
          zones: { $sum: 1 },
          color: { $first: '$color' },
        },
      },
      { $sort: { zones: -1 } },
      { $limit: limit },
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: '_id',
          as: 'user',
        },
      },
      { $unwind: '$user' },
      {
        $project: {
          _id: 0,
          userId: '$_id',
          username: '$user.username',
          emoji: '$user.emoji',
          color: '$user.color',
          zones: 1,
          areaKm2: { $round: [{ $multiply: ['$zones', 0.01] }, 2] }, // ~100m² per cell
          points: { $multiply: ['$zones', 12] },
        },
      },
    ]);

    // Add ranks
    const ranked = leaderboard.map((entry, i) => ({ ...entry, rank: i + 1 }));

    return res.json({ ok: true, leaderboard: ranked });
  } catch (err) {
    console.error('Leaderboard error:', err);
    return res.status(500).json({ ok: false, error: 'Internal server error' });
  }
}

/**
 * GET /api/game/zone/:id
 * Get details for a single zone.
 */
export async function getZoneDetail(req, res) {
  try {
    const zone = await Zone.findById(req.params.id).populate('ownerId', 'username emoji color').lean();
    if (!zone) {
      return res.status(404).json({ ok: false, error: 'Zone not found' });
    }
    return res.json({ ok: true, zone });
  } catch (err) {
    console.error('Zone detail error:', err);
    return res.status(500).json({ ok: false, error: 'Internal server error' });
  }
}

/**
 * POST /api/game/defend
 * Defend a zone the player already owns. Bumps defense.
 */
export async function defendZone(req, res) {
  try {
    const { userId } = req.user;
    const { zoneId, lat, lng } = req.body;

    if (!zoneId) {
      return res.status(400).json({ ok: false, error: 'zoneId is required' });
    }

    // Check cooldown
    const cooldown = checkDefendCooldown(userId, zoneId);
    if (!cooldown.allowed) {
      return res.status(429).json({
        ok: false,
        error: 'Defend cooldown active',
        retryAfterMs: cooldown.retryAfterMs,
      });
    }

    // Verify ownership
    const zone = await Zone.findById(zoneId);
    if (!zone || !zone.ownerId || zone.ownerId.toString() !== userId) {
      return res.status(403).json({ ok: false, error: 'You do not own this zone' });
    }

    // Verify proximity if coordinates provided
    if (lat !== undefined && lng !== undefined) {
      const dist = haversineDistance(lat, lng, zone.lat, zone.lng);
      if (dist > CLAIM_RADIUS_M * 2) {
        return res.status(403).json({ ok: false, error: 'Too far from zone to defend' });
      }
    }

    // Bump defense (cap at 100)
    zone.contested = false;
    zone.claimedAt = new Date();
    await zone.save();

    recordDefend(userId, zoneId);

    // Log defend claim
    Claim.create({
      userId,
      zoneId,
      action: 'defend',
      coordinates: [lat || zone.lat, lng || zone.lng],
    }).catch((err) => console.error('Failed to log defend:', err.message));

    // Emit update
    const io = req.app.get('io');
    if (io) {
      io.emit('zone_update', {
        _id: zone._id,
        lat: zone.lat,
        lng: zone.lng,
        ownerId: zone.ownerId,
        color: zone.color,
        contested: false,
      });
    }

    return res.json({ ok: true, zoneId });
  } catch (err) {
    console.error('Defend zone error:', err);
    return res.status(500).json({ ok: false, error: 'Internal server error' });
  }
}

/**
 * GET /api/game/stats
 * Get overall game stats.
 */
export async function getGameStats(req, res) {
  try {
    const [totalZones, totalPlayers, totalClaims] = await Promise.all([
      Zone.countDocuments({ ownerId: { $ne: null } }),
      User.countDocuments(),
      Claim.countDocuments(),
    ]);

    return res.json({
      ok: true,
      stats: {
        totalZones,
        totalPlayers,
        totalClaims,
        gridCellSize: `${CELL_DEG}° (~100m)`,
      },
    });
  } catch (err) {
    console.error('Game stats error:', err);
    return res.status(500).json({ ok: false, error: 'Internal server error' });
  }
}
