// src/api/routes/agora.js
// Agora 視訊通話 Token 產生 API

import { Router } from 'express';
import pkg from 'agora-access-token';
const { RtcTokenBuilder, RtcRole } = pkg;
import { authenticate } from '../middleware/auth.js';

const router = Router();

/**
 * POST /api/agora/token
 * 產生 Agora RTC Token，讓用戶可以加入視訊頻道
 */
router.post('/token', authenticate, async (req, res, next) => {
  try {
    const { channelName } = req.body;

    if (!channelName) {
      return res.status(400).json({ error: '缺少 channelName' });
    }

    const appId = process.env.AGORA_APP_ID;
    const appCertificate = process.env.AGORA_APP_CERTIFICATE;

    if (!appId || !appCertificate) {
      return res.status(500).json({ error: 'Agora 設定缺失' });
    }

    // Token 有效期：1 小時
    const expirationTimeInSeconds = 3600;
    const currentTimestamp = Math.floor(Date.now() / 1000);
    const privilegeExpiredTs = currentTimestamp + expirationTimeInSeconds;

    // 使用 uid 0 讓 Agora 自動分配
    const uid = 0;

    const token = RtcTokenBuilder.buildTokenWithUid(
      appId,
      appCertificate,
      channelName,
      uid,
      RtcRole.PUBLISHER,
      privilegeExpiredTs
    );

    console.log(`[Agora] Token generated for channel: ${channelName}, user: ${req.user.id}`);

    res.json({
      token,
      channelName,
      appId,
      uid,
      expiresIn: expirationTimeInSeconds,
    });
  } catch (err) {
    console.error('[Agora] Token generation error:', err);
    next(err);
  }
});

/**
 * GET /api/agora/config
 * 取得 Agora App ID（前端初始化用）
 */
router.get('/config', authenticate, (req, res) => {
  res.json({
    appId: process.env.AGORA_APP_ID,
  });
});

export default router;
