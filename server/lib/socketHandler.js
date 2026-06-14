import { authenticateSocket } from '../middleware/auth.js';

/**
 * Initialize Socket.io event handlers.
 *
 * Events:
 *   Server → Client:
 *     - zone_update     { _id, lat, lng, ownerId, color, contested }
 *     - zones_captured  { userId, color, zones: [...] }
 *     - zones_stolen    { byUserId, byColor, zoneIds: [...] }
 *     - leaderboard_update  { leaderboard: [...] }
 *     - season_reset    { year, message }
 *
 *   Client → Server:
 *     - viewport_change { w, s, e, n }
 *     - authenticate    { token }
 */
export function initSocketHandlers(io) {
  // ── Connection middleware: authenticate JWT ──────────────────────
  io.use((socket, next) => {
    const user = authenticateSocket(socket);
    if (user) {
      socket.user = user;
      next();
    } else {
      // Allow unauthenticated connections for spectating (read-only)
      socket.user = null;
      next();
    }
  });

  io.on('connection', (socket) => {
    const userId = socket.user?.userId;
    console.log(
      `🔌 Socket connected: ${socket.id}` + (userId ? ` (user: ${socket.user.username})` : ' (spectator)'),
    );

    // Join user-specific room for targeted notifications
    if (userId) {
      socket.join(`user:${userId}`);
    }

    // ── Viewport subscription ──────────────────────────────────────
    // Clients send their current map viewport so we can optimize
    // which zone updates they receive.
    socket.currentViewport = null;

    socket.on('viewport_change', (bbox) => {
      if (!bbox || typeof bbox.w !== 'number') return;
      socket.currentViewport = bbox;

      // Join a viewport room based on coarse grid sectors
      // (simplified: we just broadcast to all for now)
    });

    // ── Late authentication (after initial anonymous connect) ──────
    socket.on('authenticate', (data) => {
      const user = authenticateSocket({ handshake: { auth: data, query: {} } });
      if (user) {
        socket.user = user;
        socket.join(`user:${user.userId}`);
        socket.emit('authenticated', { ok: true, username: user.username });
        console.log(`🔐 Socket ${socket.id} authenticated as ${user.username}`);
      } else {
        socket.emit('authenticated', { ok: false, error: 'Invalid token' });
      }
    });

    // ── Ping/Pong for latency measurement ──────────────────────────
    socket.on('ping_measure', (ts) => {
      socket.emit('pong_measure', ts);
    });

    // ── Disconnect ─────────────────────────────────────────────────
    socket.on('disconnect', (reason) => {
      console.log(`🔌 Socket disconnected: ${socket.id} (${reason})`);
    });
  });

  // Log connection stats every 60 seconds
  setInterval(() => {
    const count = io.engine.clientsCount;
    if (count > 0) {
      console.log(`📡 Active Socket.io connections: ${count}`);
    }
  }, 60_000);
}
