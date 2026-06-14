import mongoose from 'mongoose';

const VALID_ACTIONS = ['conquer', 'defend', 'lose'];

const claimSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  zoneId: {
    type: String,
    required: true,
    index: true,
  },
  action: {
    type: String,
    enum: {
      values: VALID_ACTIONS,
      message: 'Action must be one of: ' + VALID_ACTIONS.join(', '),
    },
    required: true,
  },
  coordinates: {
    type: [Number], // [lat, lng]
    required: true,
    validate: {
      validator: (v) => v.length === 2,
      message: 'Coordinates must be [lat, lng]',
    },
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

// ── 90-day TTL index for automatic historical purging ────────────────
// MongoDB will automatically delete documents 90 days after createdAt
claimSchema.index({ createdAt: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });

// Compound index for rate-limiting queries (recent claims by user)
claimSchema.index({ userId: 1, createdAt: -1 });

const Claim = mongoose.model('Claim', claimSchema);
export default Claim;
