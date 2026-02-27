// src/api/routes/matching.js
// 配對相關 API

import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { getDb } from '../db/connection.js';

const router = Router();

/**
 * GET /api/matching/suggestions
 * 取得推薦對象列表
 */
router.get('/suggestions', authenticate, async (req, res, next) => {
  try {
    const db = getDb();
    const userId = req.user.id;
    const userRole = req.user.role;

    // 推薦相反角色的用戶（台灣男生看越南女生，反之亦然）
    const targetRole = userRole === 'taiwan' ? 'vietnam' : 'taiwan';

    const result = await db.query(
      `SELECT u.id, u.role,
              p.display_name, p.age, p.location, p.bio,
              p.interests, p.avatar_url, p.is_verified, p.is_online
       FROM users u
       JOIN profiles p ON u.id = p.user_id
       WHERE u.role = $1
         AND u.id NOT IN (
           SELECT user_b FROM matches WHERE user_a = $2
           UNION
           SELECT user_a FROM matches WHERE user_b = $2
         )
       ORDER BY p.is_online DESC, p.is_verified DESC, RANDOM()
       LIMIT 20`,
      [targetRole, userId]
    );

    res.json(result.rows);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/matching/like/:userId
 * 喜歡某人
 */
router.post('/like/:userId', authenticate, async (req, res, next) => {
  try {
    const db = getDb();
    const userId = req.user.id;
    const targetUserId = req.params.userId;

    if (userId === targetUserId) {
      return res.status(400).json({ error: '不能喜歡自己' });
    }

    // 檢查對方是否已經喜歡我
    const existingMatch = await db.query(
      `SELECT * FROM matches
       WHERE user_a = $1 AND user_b = $2 AND status = 'pending'`,
      [targetUserId, userId]
    );

    if (existingMatch.rows.length > 0) {
      // 配對成功！
      await db.query(
        `UPDATE matches SET status = 'matched' WHERE id = $1`,
        [existingMatch.rows[0].id]
      );

      return res.json({
        matched: true,
        matchId: existingMatch.rows[0].id,
        message: '配對成功！',
      });
    }

    // 建立新的喜歡記錄
    const result = await db.query(
      `INSERT INTO matches (user_a, user_b, status)
       VALUES ($1, $2, 'pending')
       ON CONFLICT DO NOTHING
       RETURNING id`,
      [userId, targetUserId]
    );

    res.json({
      matched: false,
      message: '已送出喜歡',
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/matching/skip/:userId
 * 略過某人
 */
router.post('/skip/:userId', authenticate, async (req, res, next) => {
  try {
    const db = getDb();
    const userId = req.user.id;
    const targetUserId = req.params.userId;

    // 建立略過記錄（用 'skipped' 狀態）
    await db.query(
      `INSERT INTO matches (user_a, user_b, status)
       VALUES ($1, $2, 'skipped')
       ON CONFLICT DO NOTHING`,
      [userId, targetUserId]
    );

    res.json({ message: '已略過' });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/matching/matches
 * 取得已配對列表
 */
router.get('/matches', authenticate, async (req, res, next) => {
  try {
    const db = getDb();
    const userId = req.user.id;

    const result = await db.query(
      `SELECT m.id as match_id, m.created_at as matched_at,
              u.id, u.role,
              p.display_name, p.avatar_url, p.is_online, p.is_verified
       FROM matches m
       JOIN users u ON (
         CASE WHEN m.user_a = $1 THEN m.user_b ELSE m.user_a END = u.id
       )
       JOIN profiles p ON u.id = p.user_id
       WHERE (m.user_a = $1 OR m.user_b = $1)
         AND m.status = 'matched'
       ORDER BY m.created_at DESC`,
      [userId]
    );

    res.json(result.rows);
  } catch (err) {
    next(err);
  }
});

export default router;
