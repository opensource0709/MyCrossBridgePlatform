// src/api/routes/users.js
// 用戶資料 API

import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { getDb } from '../db/connection.js';

const router = Router();

/**
 * GET /api/users/me
 * 取得自己的資料
 */
router.get('/me', authenticate, async (req, res, next) => {
  try {
    const db = getDb();

    const result = await db.query(
      `SELECT u.id, u.email, u.role, u.created_at,
              p.display_name, p.age, p.location, p.bio,
              p.interests, p.avatar_url, p.is_verified, p.is_online
       FROM users u
       LEFT JOIN profiles p ON u.id = p.user_id
       WHERE u.id = $1`,
      [req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: '用戶不存在' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /api/users/me
 * 更新個人資料
 */
router.put('/me', authenticate, async (req, res, next) => {
  try {
    const { displayName, age, location, bio, interests, avatarUrl } = req.body;
    const db = getDb();

    const result = await db.query(
      `UPDATE profiles
       SET display_name = COALESCE($1, display_name),
           age = COALESCE($2, age),
           location = COALESCE($3, location),
           bio = COALESCE($4, bio),
           interests = COALESCE($5, interests),
           avatar_url = COALESCE($6, avatar_url)
       WHERE user_id = $7
       RETURNING *`,
      [displayName, age, location, bio, interests, avatarUrl, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: '個人資料不存在' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/users/me/avatar
 * 上傳頭像（Phase 1 簡化版，實際應上傳到 S3）
 */
router.post('/me/avatar', authenticate, async (req, res, next) => {
  try {
    const { avatarUrl } = req.body;

    if (!avatarUrl) {
      return res.status(400).json({ error: '缺少 avatarUrl' });
    }

    const db = getDb();

    const result = await db.query(
      `UPDATE profiles
       SET avatar_url = $1
       WHERE user_id = $2
       RETURNING avatar_url`,
      [avatarUrl, req.user.id]
    );

    res.json({ avatarUrl: result.rows[0].avatar_url });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/users/:id
 * 取得其他用戶的公開資料
 */
router.get('/:id', authenticate, async (req, res, next) => {
  try {
    const db = getDb();

    const result = await db.query(
      `SELECT u.id, u.role,
              p.display_name, p.age, p.location, p.bio,
              p.interests, p.avatar_url, p.is_verified, p.is_online
       FROM users u
       LEFT JOIN profiles p ON u.id = p.user_id
       WHERE u.id = $1`,
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: '用戶不存在' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

export default router;
