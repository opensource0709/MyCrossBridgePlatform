// src/api/middleware/auth.js
// JWT 驗證 Middleware

import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

/**
 * 驗證 JWT Token
 */
export function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: '未提供 Token' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    next(err);
  }
}

/**
 * 產生 JWT Token
 */
export function generateToken(user) {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      role: user.role,
    },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}

/**
 * 產生 Refresh Token
 */
export function generateRefreshToken(user) {
  return jwt.sign(
    { id: user.id },
    JWT_SECRET,
    { expiresIn: '30d' }
  );
}
