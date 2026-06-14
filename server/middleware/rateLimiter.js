/**
 * In-memory rate limiters for game actions.
 *
 * - Conquest: 30 claims per minute, 200 per hour per user
 * - Defend:   1 defend per zone per user per 60 seconds
 *
 * In production with multiple server instances, replace with Redis.
 */

// ── Sliding-window counters ──────────────────────────────────────────

const conquestWindows = new Map(); // userId → { minute: [], hour: [] }
const defendCooldowns = new Map(); // `userId:zoneId` → timestamp

const CONQUEST_PER_MINUTE = 30;
const CONQUEST_PER_HOUR = 200;
const DEFEND_COOLDOWN_MS = 60_000;

// Cleanup stale entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, data] of conquestWindows) {
    data.hour = data.hour.filter((t) => now - t < 3_600_000);
    if (data.hour.length === 0) conquestWindows.delete(key);
  }
  for (const [key, ts] of defendCooldowns) {
    if (now - ts > DEFEND_COOLDOWN_MS) defendCooldowns.delete(key);
  }
}, 300_000);

/**
 * Check if a user can make a conquest claim. Returns { allowed, retryAfterMs }.
 */
export function checkConquestRate(userId) {
  const now = Date.now();
  if (!conquestWindows.has(userId)) {
    conquestWindows.set(userId, { minute: [], hour: [] });
  }
  const w = conquestWindows.get(userId);

  // Prune expired
  w.minute = w.minute.filter((t) => now - t < 60_000);
  w.hour = w.hour.filter((t) => now - t < 3_600_000);

  if (w.minute.length >= CONQUEST_PER_MINUTE) {
    return { allowed: false, retryAfterMs: 60_000 - (now - w.minute[0]) };
  }
  if (w.hour.length >= CONQUEST_PER_HOUR) {
    return { allowed: false, retryAfterMs: 3_600_000 - (now - w.hour[0]) };
  }

  return { allowed: true };
}

/**
 * Record a successful conquest for rate-limiting.
 */
export function recordConquest(userId) {
  const now = Date.now();
  if (!conquestWindows.has(userId)) {
    conquestWindows.set(userId, { minute: [], hour: [] });
  }
  const w = conquestWindows.get(userId);
  w.minute.push(now);
  w.hour.push(now);
}

/**
 * Check if a user can defend a specific zone. Returns { allowed, retryAfterMs }.
 */
export function checkDefendCooldown(userId, zoneId) {
  const key = `${userId}:${zoneId}`;
  const lastDefend = defendCooldowns.get(key);
  if (!lastDefend) return { allowed: true };

  const elapsed = Date.now() - lastDefend;
  if (elapsed >= DEFEND_COOLDOWN_MS) return { allowed: true };
  return { allowed: false, retryAfterMs: DEFEND_COOLDOWN_MS - elapsed };
}

/**
 * Record a successful defend action.
 */
export function recordDefend(userId, zoneId) {
  defendCooldowns.set(`${userId}:${zoneId}`, Date.now());
}

/**
 * Express middleware: reject if conquest rate limit exceeded.
 */
export function conquestRateLimitMiddleware(req, res, next) {
  const userId = req.user?.userId;
  if (!userId) return next();

  const result = checkConquestRate(userId);
  if (!result.allowed) {
    return res.status(429).json({
      ok: false,
      error: 'Rate limit exceeded',
      retryAfterMs: result.retryAfterMs,
    });
  }
  next();
}
