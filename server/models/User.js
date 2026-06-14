import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const VALID_COLORS = ['crimson', 'cyan', 'volt', 'magenta', 'amber', 'violet'];

const userSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: [true, 'Username is required'],
      unique: true,
      trim: true,
      minlength: [3, 'Username must be at least 3 characters'],
      maxlength: [12, 'Username must be at most 12 characters'],
      validate: {
        validator: (v) => /^[A-Za-z0-9_]{3,12}$/.test(v),
        message: 'Username may only contain letters, numbers, and underscores (3–12 chars)',
      },
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      trim: true,
      lowercase: true,
      validate: {
        validator: (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v),
        message: 'Invalid email format',
      },
    },
    passwordHash: {
      type: String,
      required: true,
    },
    emoji: {
      type: String,
      default: '🦅',
    },
    color: {
      type: String,
      enum: {
        values: VALID_COLORS,
        message: 'Color must be one of: ' + VALID_COLORS.join(', '),
      },
      default: 'cyan',
    },
  },
  {
    timestamps: true, // createdAt + updatedAt
  },
);

// ── Indexes ──────────────────────────────────────────────────────────
// (Username and email indexes are created automatically by the `unique: true` property)

// ── Pre-save: hash password ──────────────────────────────────────────
userSchema.pre('save', async function (next) {
  if (!this.isModified('passwordHash')) return next();
  try {
    const salt = await bcrypt.genSalt(12);
    this.passwordHash = await bcrypt.hash(this.passwordHash, salt);
    next();
  } catch (err) {
    next(err);
  }
});

// ── Instance: compare password ───────────────────────────────────────
userSchema.methods.comparePassword = async function (candidate) {
  return bcrypt.compare(candidate, this.passwordHash);
};

// ── Transform: strip passwordHash from JSON output ───────────────────
userSchema.set('toJSON', {
  transform: (_doc, ret) => {
    delete ret.passwordHash;
    delete ret.__v;
    return ret;
  },
});

const User = mongoose.model('User', userSchema);
export default User;
