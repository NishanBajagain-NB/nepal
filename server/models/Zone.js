import mongoose from 'mongoose';

const zoneSchema = new mongoose.Schema(
  {
    _id: {
      type: String, // structured as "lat6_lng6" cell ID, e.g. "27717_85324"
    },
    lat: {
      type: Number,
      required: true,
    },
    lng: {
      type: Number,
      required: true,
    },
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    color: {
      type: String,
      default: null, // denormalized from owner for fast map rendering
    },
    contested: {
      type: Boolean,
      default: false,
    },
    claimedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true, // updatedAt auto-managed
    _id: false, // we manage _id ourselves
  },
);

// ── Indexes ──────────────────────────────────────────────────────────
// Fast lookup by owner (leaderboard aggregation, user zone count)
zoneSchema.index({ ownerId: 1 });

// Bounding-box viewport queries
zoneSchema.index({ lat: 1, lng: 1 });

// Quickly find contested zones for real-time alerts
zoneSchema.index({ contested: 1 }, { partialFilterExpression: { contested: true } });

// Defense decay: find zones not recently claimed
zoneSchema.index({ claimedAt: 1 });

const Zone = mongoose.model('Zone', zoneSchema);
export default Zone;
