// src/api/websocket/voiceTranslation.js
// 語音翻譯 WebSocket 處理器

import { WebSocketServer } from 'ws';
import { speechToTextFromBuffer } from '../../pipeline/stt.js';
import { translate } from '../../pipeline/translate.js';
import { textToSpeech } from '../../pipeline/tts.js';
import jwt from 'jsonwebtoken';
import { parse } from 'url';

/**
 * 初始化語音翻譯 WebSocket
 * @param {http.Server} server - HTTP 伺服器
 */
export function initVoiceTranslation(server) {
  const wss = new WebSocketServer({ noServer: true });

  // 處理升級請求
  server.on('upgrade', (request, socket, head) => {
    const { pathname, query } = parse(request.url, true);

    if (pathname === '/ws/voice') {
      // 驗證 token
      const token = query.token;
      if (!token) {
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return;
      }

      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        request.userId = decoded.id;
        request.userRole = decoded.role;
        request.direction = query.direction || (decoded.role === 'taiwan' ? 'zh-to-vi' : 'vi-to-zh');

        wss.handleUpgrade(request, socket, head, (ws) => {
          wss.emit('connection', ws, request);
        });
      } catch (err) {
        console.error('[VoiceWS] Token 驗證失敗:', err.message);
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
      }
    }
  });

  wss.on('connection', (ws, request) => {
    const { userId, userRole, direction } = request;
    console.log(`[VoiceWS] 用戶連接: ${userId}, 角色: ${userRole}, 方向: ${direction}`);

    // 發送連接成功訊息
    ws.send(JSON.stringify({
      type: 'connected',
      direction,
      message: '語音翻譯已連接',
    }));

    ws.on('message', async (data) => {
      try {
        // 檢查是否為二進位資料（音訊）
        if (Buffer.isBuffer(data)) {
          await handleAudioChunk(ws, data, direction);
        } else {
          // JSON 訊息
          const message = JSON.parse(data.toString());
          if (message.type === 'ping') {
            ws.send(JSON.stringify({ type: 'pong' }));
          }
        }
      } catch (error) {
        console.error('[VoiceWS] 處理訊息錯誤:', error);
        ws.send(JSON.stringify({
          type: 'error',
          message: error.message || '處理失敗',
        }));
      }
    });

    ws.on('close', () => {
      console.log(`[VoiceWS] 用戶斷開: ${userId}`);
    });

    ws.on('error', (error) => {
      console.error(`[VoiceWS] 錯誤: ${userId}`, error);
    });
  });

  console.log('[VoiceWS] 語音翻譯 WebSocket 已初始化');
  return wss;
}

/**
 * 處理音訊片段
 */
async function handleAudioChunk(ws, audioBuffer, direction) {
  const startTime = Date.now();

  // 確定語言
  const [sourceLang, targetLang] = direction.split('-to-');
  console.log(`[VoiceWS] 處理音訊: ${audioBuffer.length} bytes, ${sourceLang} → ${targetLang}`);

  // 音訊太小可能是靜音，跳過
  if (audioBuffer.length < 1000) {
    console.log('[VoiceWS] 音訊太小，跳過');
    return;
  }

  try {
    // 1. STT - 語音辨識
    const sttResult = await speechToTextFromBuffer(audioBuffer, sourceLang);

    if (!sttResult.text || sttResult.text.trim() === '') {
      console.log('[VoiceWS] 無辨識結果，跳過');
      return;
    }

    // 2. 翻譯
    const translateResult = await translate(sttResult.text, direction);

    // 3. TTS - 語音合成
    const ttsResult = await textToSpeech(translateResult.text, targetLang);

    const totalElapsed = Date.now() - startTime;
    console.log(`[VoiceWS] 完成翻譯: ${sttResult.text} → ${translateResult.text} (${totalElapsed}ms)`);

    // 4. 回傳結果
    ws.send(JSON.stringify({
      type: 'translation',
      originalText: sttResult.text,
      translatedText: translateResult.text,
      audio: ttsResult.buffer.toString('base64'),
      latency: {
        stt: sttResult.elapsed,
        translate: translateResult.elapsed,
        tts: ttsResult.elapsed,
        total: totalElapsed,
      },
    }));

  } catch (error) {
    console.error('[VoiceWS] 翻譯錯誤:', error);
    ws.send(JSON.stringify({
      type: 'error',
      message: '翻譯失敗: ' + (error.message || '未知錯誤'),
    }));
  }
}
