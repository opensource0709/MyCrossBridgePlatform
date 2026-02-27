// src/api/routes/auth.js
// 認證相關 API

import { Router } from 'express';
import bcrypt from 'bcrypt';
import { generateToken, generateRefreshToken } from '../middleware/auth.js';
import { getDb } from '../db/connection.js';

const router = Router();

/**
 * POST /api/auth/register
 * 用戶註冊
 */
router.post('/register', async (req, res, next) => {
  try {
    const { email, password, role, displayName } = req.body;

    // 驗證必填欄位
    if (!email || !password || !role || !displayName) {
      return res.status(400).json({ error: '缺少必填欄位' });
    }

    // 驗證 role
    if (!['taiwan', 'vietnam'].includes(role)) {
      return res.status(400).json({ error: '無效的角色' });
    }

    // 密碼雜湊
    const passwordHash = await bcrypt.hash(password, 10);

    const db = getDb();

    // 建立用戶
    const userResult = await db.query(
      `INSERT INTO users (email, password_hash, role)
       VALUES ($1, $2, $3)
       RETURNING id, email, role, created_at`,
      [email, passwordHash, role]
    );

    const user = userResult.rows[0];

    // 建立個人資料
    await db.query(
      `INSERT INTO profiles (user_id, display_name)
       VALUES ($1, $2)`,
      [user.id, displayName]
    );

    // 產生 Token
    const token = generateToken(user);
    const refreshToken = generateRefreshToken(user);

    res.status(201).json({
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        displayName,
      },
      token,
      refreshToken,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/auth/login
 * 用戶登入
 */
router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: '缺少 email 或密碼' });
    }

    const db = getDb();

    // 查詢用戶
    const result = await db.query(
      `SELECT u.*, p.display_name
       FROM users u
       LEFT JOIN profiles p ON u.id = p.user_id
       WHERE u.email = $1`,
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: '帳號或密碼錯誤' });
    }

    const user = result.rows[0];

    // 驗證密碼
    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      return res.status(401).json({ error: '帳號或密碼錯誤' });
    }

    // 產生 Token
    const token = generateToken(user);
    const refreshToken = generateRefreshToken(user);

    res.json({
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        displayName: user.display_name,
      },
      token,
      refreshToken,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/auth/refresh
 * 刷新 Token
 */
router.post('/refresh', async (req, res, next) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json({ error: '缺少 refreshToken' });
    }

    // 驗證 refresh token（簡化版，實際應該存在 Redis）
    const jwt = await import('jsonwebtoken');
    const decoded = jwt.default.verify(
      refreshToken,
      process.env.JWT_SECRET || 'your-secret-key-change-in-production'
    );

    const db = getDb();
    const result = await db.query(
      'SELECT * FROM users WHERE id = $1',
      [decoded.id]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: '用戶不存在' });
    }

    const user = result.rows[0];
    const newToken = generateToken(user);

    res.json({ token: newToken });
  } catch (err) {
    next(err);
  }
});

export default router;
