// src/api/routes/diagnostic.js
// 診斷頁面專用 API（不需要登入）

import express from 'express';
import { speechToTextFromBuffer } from '../../pipeline/stt.js';
import { translate } from '../../pipeline/translate.js';

const router = express.Router();

/**
 * POST /api/diagnostic/translate
 * 接收音訊，回傳 STT + 翻譯結果
 *
 * Body:
 * - audio: base64 encoded webm audio
 * - direction: 'zh-to-vi' | 'vi-to-zh'
 */
router.post('/translate', async (req, res) => {
  const startTime = Date.now();
  const timings = {};

  try {
    const { audio, direction = 'zh-to-vi' } = req.body;

    if (!audio) {
      return res.status(400).json({ error: '缺少音訊資料' });
    }

    // 解碼 base64 音訊
    const audioBuffer = Buffer.from(audio, 'base64');
    console.log('[Diagnostic] 收到音訊，大小:', audioBuffer.length, 'bytes');

    // 檢查音訊大小（太小可能是靜音）
    if (audioBuffer.length < 1000) {
      return res.status(400).json({ error: '音訊太短或靜音' });
    }

    // 確定語言
    const [sourceLang, targetLang] = direction.split('-to-');
    console.log('[Diagnostic] 翻譯方向:', sourceLang, '->', targetLang);

    // 1. STT - 語音辨識
    const sttStart = Date.now();
    const sttResult = await speechToTextFromBuffer(audioBuffer, sourceLang);
    timings.stt = Date.now() - sttStart;
    console.log('[Diagnostic] STT 結果:', sttResult.text || '(空)', '耗時:', timings.stt, 'ms');

    if (!sttResult.text || sttResult.text.trim() === '') {
      return res.json({
        success: false,
        error: '無法辨識語音，請再試一次',
        timings,
      });
    }

    const originalText = sttResult.text.trim();

    // 過濾太短的結果
    if (originalText.length < 2) {
      return res.json({
        success: false,
        error: '辨識結果太短',
        originalText,
        timings,
      });
    }

    // 2. 翻譯
    const translateStart = Date.now();
    const translateResult = await translate(originalText, direction);
    timings.translate = Date.now() - translateStart;
    console.log('[Diagnostic] 翻譯結果:', translateResult.text, '耗時:', timings.translate, 'ms');

    timings.total = Date.now() - startTime;

    res.json({
      success: true,
      originalText,
      translatedText: translateResult.text,
      direction,
      timings,
    });

  } catch (error) {
    console.error('[Diagnostic] 錯誤:', error);
    res.status(500).json({
      success: false,
      error: error.message || '處理失敗',
      timings,
    });
  }
});

/**
 * GET /api/diagnostic/health
 * 檢查診斷 API 狀態
 */
router.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    endpoints: [
      'POST /api/diagnostic/translate',
    ],
  });
});

export default router;
