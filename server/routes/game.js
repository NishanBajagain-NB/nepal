import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { conquestRateLimitMiddleware } from '../middleware/rateLimiter.js';
import {
  handleLocationUpdate,
  handleBatchLocationUpdate,
  getViewportZones,
  getLeaderboard,
  getZoneDetail,
  defendZone,
  getGameStats,
} from '../controllers/gameController.js';

const router = Router();

// ── Public ───────────────────────────────────────────────────────────
router.get('/zones', getViewportZones);
router.get('/leaderboard', getLeaderboard);
router.get('/zone/:id', getZoneDetail);
router.get('/stats', getGameStats);

// ── Protected ────────────────────────────────────────────────────────
router.post('/location', requireAuth, conquestRateLimitMiddleware, handleLocationUpdate);
router.post('/location/batch', requireAuth, handleBatchLocationUpdate);
router.post('/defend', requireAuth, defendZone);

export default router;
