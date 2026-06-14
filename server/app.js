/**
 * Nepal Territory Conquest — Unified Express + Socket.io + MongoDB Server
 *
 * Features:
 *   • Express REST API for auth & game actions
 *   • Socket.io for real-time zone ownership sync
 *   • Mongoose ODM with optimized indexes
 *   • node-cron for automated season resets & maintenance
 *   • Helmet + CORS + rate limiting security hardening
 */

import 'dotenv/config';
import dns from 'dns';
try {
  dns.setServers(['8.8.8.8', '1.1.1.1']);
  dns.setDefaultResultOrder('ipv4first');
} catch (err) {
  console.warn('⚠️ DNS server override failed:', err.message);
}
import { createServer } from 'http';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import mongoose from 'mongoose';
import { Server as SocketIOServer } from 'socket.io';
import cron from 'node-cron';

import authRoutes from './routes/auth.js';
import gameRoutes from './routes/game.js';
import { initSocketHandlers } from './lib/socketHandler.js';

// Models (import to register Mongoose schemas)
import './models/User.js';
import './models/Zone.js';
import './models/Claim.js';
import './models/SeasonHistory.js';

// Lazy imports for cron jobs (avoid circular deps)
const getModels = () => ({
  Zone: mongoose.model('Zone'),
  User: mongoose.model('User'),
  Claim: mongoose.model('Claim'),
  SeasonHistory: mongoose.model('SeasonHistory'),
});

// ═══════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════
const PORT = parseInt(process.env.PORT) || 3001;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/nepal_conquest';
const CORS_ORIGIN = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map((s) => s.trim())
  : ['http://localhost:5173', 'http://localhost:3000'];
const IS_PROD = process.env.NODE_ENV === 'production';

// ═══════════════════════════════════════════════════════════════════════
// EXPRESS APP
// ═══════════════════════════════════════════════════════════════════════
const app = express();
const httpServer = createServer(app);

// ── Security headers ─────────────────────────────────────────────────
app.use(
  helmet({
    contentSecurityPolicy: IS_PROD ? undefined : false,
    crossOriginEmbedderPolicy: false,
  }),
);

// ── CORS ─────────────────────────────────────────────────────────────
app.use(cors({
  origin: IS_PROD ? CORS_ORIGIN : true, // allow any origin in dev (mirrors requesting origin)
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// ── Body parsing ─────────────────────────────────────────────────────
app.use(express.json({ limit: '1mb' }));

// ── Global rate limiting ─────────────────────────────────────────────
app.use(
  rateLimit({
    windowMs: 60_000,
    max: IS_PROD ? 120 : 600, // relaxed in dev
    standardHeaders: true,
    legacyHeaders: false,
    message: { ok: false, error: 'Too many requests, slow down' },
  }),
);

// ── Trust proxy (for rate limiter behind reverse proxies) ────────────
if (IS_PROD) app.set('trust proxy', 1);

// ── Static files (Service Worker, etc.) ──────────────────────────────
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
app.use(express.static(join(__dirname, 'public')));

// ── API Routes ───────────────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/game', gameRoutes);

// ── Health check ─────────────────────────────────────────────────────
app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    uptime: Math.round(process.uptime()),
    mongo: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    timestamp: new Date().toISOString(),
  });
});

// ── 404 handler ──────────────────────────────────────────────────────
app.use('/api/*', (_req, res) => {
  res.status(404).json({ ok: false, error: 'Endpoint not found' });
});

// ── Global error handler ─────────────────────────────────────────────
app.use((err, _req, res, _next) => {
  console.error('💥 Unhandled error:', err);
  res.status(err.status || 500).json({
    ok: false,
    error: IS_PROD ? 'Internal server error' : err.message,
  });
});

// ═══════════════════════════════════════════════════════════════════════
// SOCKET.IO
// ═══════════════════════════════════════════════════════════════════════
const io = new SocketIOServer(httpServer, {
  cors: {
    origin: CORS_ORIGIN,
    methods: ['GET', 'POST'],
    credentials: true,
  },
  pingInterval: 25_000,
  pingTimeout: 20_000,
});

// Make io accessible from request handlers via req.app.get('io')
app.set('io', io);

// Initialize Socket.io event handlers
initSocketHandlers(io);

// ═══════════════════════════════════════════════════════════════════════
// MONGODB CONNECTION
// ═══════════════════════════════════════════════════════════════════════
async function connectDatabase() {
  try {
    await mongoose.connect(MONGODB_URI, {
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45_000,
    });
    console.log('✅ MongoDB connected:', MONGODB_URI.replace(/\/\/.*@/, '//***@'));
  } catch (err) {
    console.error('❌ MongoDB connection failed:', err.message);
    console.log('⏳ Retrying in 5 seconds...');
    setTimeout(connectDatabase, 5000);
  }
}

mongoose.connection.on('error', (err) => {
  console.error('MongoDB error:', err.message);
});

mongoose.connection.on('disconnected', () => {
  console.warn('⚠️  MongoDB disconnected. Attempting reconnection...');
});

// ═══════════════════════════════════════════════════════════════════════
// CRON JOBS (node-cron)
// ═══════════════════════════════════════════════════════════════════════

/**
 * 🗓️ NEW YEAR SEASON RESET
 * Triggers at midnight UTC on January 1st.
 * 1. Backup final leaderboard to season_history
 * 2. Wipe all zones
 * 3. Reset user scores (preserve profiles)
 */
cron.schedule(
  '0 0 1 1 *',
  async () => {
    console.log('🎆 ══ NEW YEAR SEASON RESET TRIGGERED ══');
    try {
      const { Zone, SeasonHistory } = getModels();
      const year = new Date().getFullYear() - 1; // The year that just ended

      // 1. Build final leaderboard
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
        { $limit: 100 },
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
            userId: '$_id',
            username: '$user.username',
            emoji: '$user.emoji',
            color: '$user.color',
            zones: 1,
            points: { $multiply: ['$zones', 12] },
          },
        },
      ]);

      const ranked = leaderboard.map((entry, i) => ({ ...entry, rank: i + 1 }));

      // 2. Archive to season_history
      const totalZones = await Zone.countDocuments({ ownerId: { $ne: null } });
      const totalPlayers = await mongoose.model('User').countDocuments();

      await SeasonHistory.findOneAndUpdate(
        { year },
        {
          year,
          leaderboard: ranked,
          totalZonesClaimed: totalZones,
          totalPlayers,
          archivedAt: new Date(),
        },
        { upsert: true },
      );
      console.log(`✅ Season ${year} archived: ${ranked.length} players, ${totalZones} zones`);

      // 3. Wipe all zones
      const deleteResult = await Zone.deleteMany({});
      console.log(`✅ Zones wiped: ${deleteResult.deletedCount} zones removed`);

      // 4. Broadcast season reset via Socket.io
      io.emit('season_reset', {
        year: year + 1,
        message: `Season ${year} has ended! All territory has been reset. Happy New Year ${year + 1}! 🎆`,
        archivedLeaderboard: ranked.slice(0, 10), // Top 10 from last season
      });

      console.log('🎆 ══ SEASON RESET COMPLETE ══');
    } catch (err) {
      console.error('❌ Season reset failed:', err);
    }
  },
  { timezone: 'UTC' },
);

/**
 * ⚔️ DEFENSE DECAY
 * Every 6 hours: zones not re-claimed in 12+ hours lose defense points.
 * Zones with zero defense after decay are released to unowned.
 */
cron.schedule('0 */6 * * *', async () => {
  try {
    const { Zone } = getModels();
    const tweleveHoursAgo = new Date(Date.now() - 12 * 60 * 60 * 1000);

    // Release zones that haven't been defended in 7 days
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const released = await Zone.updateMany(
      { ownerId: { $ne: null }, claimedAt: { $lt: sevenDaysAgo } },
      { $set: { ownerId: null, color: null, contested: false } },
    );

    if (released.modifiedCount > 0) {
      console.log(`⚔️  Defense decay: ${released.modifiedCount} zones released (unclaimed >7 days)`);
      io.emit('zones_decayed', { count: released.modifiedCount });
    }
  } catch (err) {
    console.error('Defense decay cron error:', err);
  }
});

/**
 * 📊 LEADERBOARD CACHE REFRESH
 * Every 30 seconds: pre-compute leaderboard for fast reads.
 */
let cachedLeaderboard = [];
cron.schedule('*/30 * * * * *', async () => {
  try {
    const { Zone } = getModels();
    if (mongoose.connection.readyState !== 1) return;

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
      { $limit: 50 },
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
          areaKm2: { $round: [{ $multiply: ['$zones', 0.01] }, 2] },
          points: { $multiply: ['$zones', 12] },
        },
      },
    ]);

    cachedLeaderboard = leaderboard.map((entry, i) => ({ ...entry, rank: i + 1 }));

    // Broadcast updated leaderboard if there are connected clients
    if (io.engine.clientsCount > 0 && cachedLeaderboard.length > 0) {
      io.emit('leaderboard_update', { leaderboard: cachedLeaderboard });
    }
  } catch (err) {
    // Silently ignore — leaderboard is non-critical
  }
});



/**
 * 🗑️ DEAD ZONE RELEASE
 * Daily at 03:00 UTC: release zones with no owner interaction in 14 days.
 */
cron.schedule(
  '0 3 * * *',
  async () => {
    try {
      const { Zone } = getModels();
      const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);

      const result = await Zone.deleteMany({
        ownerId: null,
        updatedAt: { $lt: fourteenDaysAgo },
      });

      if (result.deletedCount > 0) {
        console.log(`🗑️  Dead zone cleanup: ${result.deletedCount} orphaned zones removed`);
      }
    } catch (err) {
      console.error('Dead zone cleanup error:', err);
    }
  },
  { timezone: 'UTC' },
);

// ═══════════════════════════════════════════════════════════════════════
// START SERVER
// ═══════════════════════════════════════════════════════════════════════
async function start() {
  await connectDatabase();

  httpServer.listen(PORT, () => {
    console.log('');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('  🏔️  Nepal Territory Conquest — Server');
    console.log('═══════════════════════════════════════════════════════════');
    console.log(`  🌐 HTTP API:    http://localhost:${PORT}/api`);
    console.log(`  🔌 Socket.io:   http://localhost:${PORT}`);
    console.log(`  💚 Health:      http://localhost:${PORT}/api/health`);
    console.log(`  📊 Leaderboard: http://localhost:${PORT}/api/game/leaderboard`);
    console.log(`  🗺️  Zones:       http://localhost:${PORT}/api/game/zones?w=80&s=26&e=88&n=30`);
    console.log('═══════════════════════════════════════════════════════════');
    console.log(`  ⏰ Cron jobs active:`);
    console.log(`     • New Year season reset (Jan 1 00:00 UTC)`);
    console.log(`     • Defense decay (every 6 hours)`);
    console.log(`     • Leaderboard refresh (every 30 seconds)`);
    console.log(`     • Dead zone cleanup (daily 03:00 UTC)`);
    console.log('═══════════════════════════════════════════════════════════');
    console.log('');
  });
}

start().catch((err) => {
  console.error('💥 Failed to start server:', err);
  process.exit(1);
});

export { app, io, httpServer };
