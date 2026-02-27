// src/api/routes/messages.js
// 訊息相關 API（含 AI 翻譯）

import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { getDb } from '../db/connection.js';
import { translate } from '../../pipeline/translate.js';

const router = Router();

/**
 * GET /api/messages/:matchId
 * 取得對話紀錄
 */
router.get('/:matchId', authenticate, async (req, res, next) => {
  try {
    const db = getDb();
    const userId = req.user.id;
    const matchId = req.params.matchId;

    // 驗證用戶是否屬於這個配對
    const matchCheck = await db.query(
      `SELECT * FROM matches
       WHERE id = $1 AND (user_a = $2 OR user_b = $2) AND status = 'matched'`,
      [matchId, userId]
    );

    if (matchCheck.rows.length === 0) {
      return res.status(403).json({ error: '無權存取此對話' });
    }

    // 取得訊息
    const result = await db.query(
      `SELECT m.id, m.sender_id, m.original_text, m.translated_text,
              m.source_lang, m.target_lang, m.created_at,
              p.display_name as sender_name
       FROM messages m
       JOIN profiles p ON m.sender_id = p.user_id
       WHERE m.match_id = $1
       ORDER BY m.created_at ASC
       LIMIT 100`,
      [matchId]
    );

    res.json(result.rows);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/messages/:matchId
 * 發送訊息（含 AI 翻譯）
 */
router.post('/:matchId', authenticate, async (req, res, next) => {
  try {
    const db = getDb();
    const userId = req.user.id;
    const userRole = req.user.role;
    const matchId = req.params.matchId;
    const { text } = req.body;

    if (!text || text.trim().length === 0) {
      return res.status(400).json({ error: '訊息不能為空' });
    }

    // 驗證用戶是否屬於這個配對
    const matchCheck = await db.query(
      `SELECT * FROM matches
       WHERE id = $1 AND (user_a = $2 OR user_b = $2) AND status = 'matched'`,
      [matchId, userId]
    );

    if (matchCheck.rows.length === 0) {
      return res.status(403).json({ error: '無權存取此對話' });
    }

    // 根據用戶角色決定翻譯方向
    const sourceLang = userRole === 'taiwan' ? 'zh' : 'vi';
    const targetLang = userRole === 'taiwan' ? 'vi' : 'zh';
    const direction = `${sourceLang}-to-${targetLang}`;

    // AI 翻譯
    let translatedText = '';
    try {
      const translateResult = await translate(text, direction);
      translatedText = translateResult.text;
    } catch (err) {
      console.error('[翻譯錯誤]', err.message);
      translatedText = '[翻譯失敗]';
    }

    // 儲存訊息
    const result = await db.query(
      `INSERT INTO messages (match_id, sender_id, original_text, translated_text, source_lang, target_lang)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [matchId, userId, text, translatedText, sourceLang, targetLang]
    );

    const message = result.rows[0];

    // 取得發送者名稱
    const senderProfile = await db.query(
      'SELECT display_name FROM profiles WHERE user_id = $1',
      [userId]
    );
    const senderName = senderProfile.rows[0]?.display_name || 'Unknown';

    const messageData = {
      id: message.id,
      matchId: matchId,
      senderId: message.sender_id,
      senderName: senderName,
      originalText: message.original_text,
      translatedText: message.translated_text,
      sourceLang: message.source_lang,
      targetLang: message.target_lang,
      createdAt: message.created_at,
    };

    // 透過 WebSocket 廣播給聊天室
    const io = req.app.get('io');
    if (io) {
      io.to(`match:${matchId}`).emit('message:received', messageData);
    }

    res.status(201).json(messageData);
  } catch (err) {
    next(err);
  }
});

export default router;
