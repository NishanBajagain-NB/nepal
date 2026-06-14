/**
 * Nepal Territory Conquest — Vercel Serverless Function
 *
 * Wraps the Express app for Vercel's serverless runtime.
 * Socket.io and cron jobs are disabled — REST API only.
 */

import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import mongoose from 'mongoose';

import authRoutes from '../server/routes/auth.js';
import gameRoutes from '../server/routes/game.js';

// Models (import to register Mongoose schemas)
import '../server/models/User.js';
import '../server/models/Zone.js';
import '../server/models/Claim.js';
import '../server/models/SeasonHistory.js';

// ═══════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/nepal_conquest';
const CORS_ORIGIN = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map((s) => s.trim())
  : ['http://localhost:5173', 'http://localhost:3000'];
const IS_PROD = process.env.NODE_ENV === 'production';

// ═══════════════════════════════════════════════════════════════════════
// MONGODB CONNECTION (cached across warm invocations)
// ═══════════════════════════════════════════════════════════════════════
let isConnected = false;

async function connectDatabase() {
  if (isConnected && mongoose.connection.readyState === 1) return;
  try {
    await mongoose.connect(MONGODB_URI, {
      maxPoolSize: 5,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45_000,
    });
    isConnected = true;
    console.log('✅ MongoDB connected (serverless)');
  } catch (err) {
    console.error('❌ MongoDB connection failed:', err.message);
    throw err;
  }
}

// ═══════════════════════════════════════════════════════════════════════
// EXPRESS APP
// ═══════════════════════════════════════════════════════════════════════
const app = express();

// ── Security headers ─────────────────────────────────────────────────
app.use(
  helmet({
    contentSecurityPolicy: IS_PROD ? undefined : false,
    crossOriginEmbedderPolicy: false,
  }),
);

// ── CORS ─────────────────────────────────────────────────────────────
app.use(cors({
  origin: IS_PROD ? CORS_ORIGIN : true,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// ── Body parsing ─────────────────────────────────────────────────────
app.use(express.json({ limit: '1mb' }));

// ── Trust proxy (Vercel is always behind a proxy) ────────────────────
app.set('trust proxy', 1);

// ── Stub io on app so controllers that call req.app.get('io') don't crash ──
app.set('io', null);

// ── Connect to MongoDB before handling requests ──────────────────────
app.use(async (_req, _res, next) => {
  try {
    await connectDatabase();
    next();
  } catch (err) {
    next(err);
  }
});

// ── API Routes ───────────────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/game', gameRoutes);

// ── Health check ─────────────────────────────────────────────────────
app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    uptime: Math.round(process.uptime()),
    mongo: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    runtime: 'vercel-serverless',
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

export default app;
