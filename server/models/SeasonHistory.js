import mongoose from 'mongoose';

const leaderboardEntrySchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    username: String,
    emoji: String,
    color: String,
    zones: Number,
    points: Number,
    rank: Number,
  },
  { _id: false },
);

const seasonHistorySchema = new mongoose.Schema({
  year: {
    type: Number,
    required: true,
    unique: true,
    index: true,
  },
  leaderboard: {
    type: [leaderboardEntrySchema],
    default: [],
  },
  totalZonesClaimed: {
    type: Number,
    default: 0,
  },
  totalPlayers: {
    type: Number,
    default: 0,
  },
  archivedAt: {
    type: Date,
    default: Date.now,
  },
});

const SeasonHistory = mongoose.model('SeasonHistory', seasonHistorySchema);
export default SeasonHistory;
