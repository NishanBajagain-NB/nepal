import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_change_me';

/**
 * Express middleware: verify JWT from Authorization header.
 * Attaches `req.user = { userId, username, color, emoji }` on success.
 */
export function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ ok: false, error: 'Missing or malformed Authorization header' });
  }

  const token = header.slice(7);
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = {
      userId: payload.userId,
      username: payload.username,
      color: payload.color,
      emoji: payload.emoji,
    };
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ ok: false, error: 'Token expired' });
    }
    return res.status(401).json({ ok: false, error: 'Invalid token' });
  }
}

/**
 * Sign a JWT for the given user document.
 */
export function signToken(user) {
  return jwt.sign(
    {
      userId: user._id.toString(),
      username: user.username,
      color: user.color,
      emoji: user.emoji,
    },
    JWT_SECRET,
    { expiresIn: '30d' },
  );
}

/**
 * Authenticate a Socket.io handshake.
 * Returns the decoded payload or null.
 */
export function authenticateSocket(socket) {
  const token = socket.handshake.auth?.token || socket.handshake.query?.token;
  if (!token) return null;
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
}
