import User from '../models/User.js';
import { signToken } from '../middleware/auth.js';

// ── Validation helpers ───────────────────────────────────────────────
const USERNAME_RE = /^[A-Za-z0-9_]{3,12}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const VALID_COLORS = ['crimson', 'cyan', 'volt', 'magenta', 'amber', 'violet'];

function validateRegistration(body) {
  const errors = {};
  if (!body.email || !EMAIL_RE.test(body.email)) errors.email = 'Valid email required';
  if (!body.password || body.password.length < 6) errors.password = 'At least 6 characters required';
  if (!body.username || !USERNAME_RE.test(body.username))
    errors.username = '3–12 chars, letters / numbers / underscore';
  if (body.color && !VALID_COLORS.includes(body.color))
    errors.color = 'Invalid color: ' + VALID_COLORS.join(', ');
  return errors;
}

// ═══════════════════════════════════════════════════════════════════════
// POST /api/auth/register
// ═══════════════════════════════════════════════════════════════════════
export async function register(req, res) {
  try {
    const { email, password, username, emoji, color } = req.body;

    // Validate
    const errors = validateRegistration(req.body);
    if (Object.keys(errors).length > 0) {
      return res.status(400).json({ ok: false, errors });
    }

    // Check duplicates
    const existingEmail = await User.findOne({ email: email.toLowerCase().trim() });
    if (existingEmail) {
      return res.status(409).json({ ok: false, errors: { email: 'Email already registered' } });
    }
    const existingUsername = await User.findOne({ username });
    if (existingUsername) {
      return res.status(409).json({ ok: false, errors: { username: 'Username already taken' } });
    }

    // Create user (password hashed via pre-save hook)
    const user = await User.create({
      email: email.toLowerCase().trim(),
      passwordHash: password, // pre-save hook will bcrypt this
      username,
      emoji: emoji || '🦅',
      color: color || 'cyan',
    });

    const token = signToken(user);

    return res.status(201).json({
      ok: true,
      token,
      user: user.toJSON(),
    });
  } catch (err) {
    console.error('Registration error:', err);

    // Handle Mongoose duplicate key errors
    if (err.code === 11000) {
      const field = Object.keys(err.keyPattern)[0];
      return res.status(409).json({
        ok: false,
        errors: { [field]: `${field} already exists` },
      });
    }

    return res.status(500).json({ ok: false, error: 'Registration failed' });
  }
}

// ═══════════════════════════════════════════════════════════════════════
// POST /api/auth/login
// ═══════════════════════════════════════════════════════════════════════
export async function login(req, res) {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ ok: false, error: 'Email and password required' });
    }

    // Find user (need to explicitly select passwordHash since it's stripped from JSON)
    const user = await User.findOne({ email: email.toLowerCase().trim() }).select('+passwordHash');
    if (!user) {
      return res.status(401).json({ ok: false, error: 'Invalid email or password' });
    }

    const valid = await user.comparePassword(password);
    if (!valid) {
      return res.status(401).json({ ok: false, error: 'Invalid email or password' });
    }

    const token = signToken(user);

    return res.json({
      ok: true,
      token,
      user: user.toJSON(),
    });
  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({ ok: false, error: 'Login failed' });
  }
}

// ═══════════════════════════════════════════════════════════════════════
// GET /api/auth/profile
// ═══════════════════════════════════════════════════════════════════════
export async function getProfile(req, res) {
  try {
    const user = await User.findById(req.user.userId);
    if (!user) {
      return res.status(404).json({ ok: false, error: 'User not found' });
    }
    return res.json({ ok: true, user: user.toJSON() });
  } catch (err) {
    console.error('Profile error:', err);
    return res.status(500).json({ ok: false, error: 'Failed to fetch profile' });
  }
}

// ═══════════════════════════════════════════════════════════════════════
// PUT /api/auth/profile
// ═══════════════════════════════════════════════════════════════════════
export async function updateProfile(req, res) {
  try {
    const { emoji, color } = req.body;
    const updates = {};

    if (emoji !== undefined) updates.emoji = emoji;
    if (color !== undefined) {
      if (!VALID_COLORS.includes(color)) {
        return res.status(400).json({ ok: false, error: 'Invalid color' });
      }
      updates.color = color;
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ ok: false, error: 'No valid fields to update' });
    }

    const user = await User.findByIdAndUpdate(req.user.userId, updates, { new: true });
    if (!user) {
      return res.status(404).json({ ok: false, error: 'User not found' });
    }

    return res.json({ ok: true, user: user.toJSON() });
  } catch (err) {
    console.error('Update profile error:', err);
    return res.status(500).json({ ok: false, error: 'Failed to update profile' });
  }
}
