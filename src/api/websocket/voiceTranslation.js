// src/api/websocket/voiceTranslation.js
// 語音翻譯 WebSocket 處理器
// 修正版：翻譯後的語音發送給對方，不是自己

import { WebSocketServer } from 'ws';
import { speechToTextFromBuffer } from '../../pipeline/stt.js';
import { translate } from '../../pipeline/translate.js';
import { textToSpeech } from '../../pipeline/tts.js';
import jwt from 'jsonwebtoken';
import { parse } from 'url';

// 儲存 Socket.IO 實例的引用
let socketIO = null;

/**
 * 設定 Socket.IO 實例
 */
export function setSocketIO(io) {
  socketIO = io;
  console.log('[VoiceWS] Socket.IO 實例已設定:', socketIO ? '成功' : '失敗');
}

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
        request.matchId = query.matchId;
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
    const { userId, userRole, direction, matchId } = request;
    console.log(`[VoiceWS] 用戶連接: ${userId}, 角色: ${userRole}, 方向: ${direction}, matchId: ${matchId}`);

    // 儲存連接資訊
    ws.userId = userId;
    ws.userRole = userRole;
    ws.direction = direction;
    ws.matchId = matchId;

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
          await handleAudioChunk(ws, data);
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
async function handleAudioChunk(ws, audioBuffer) {
  const startTime = Date.now();
  const { userId, direction, matchId } = ws;

  // 確定語言
  const [sourceLang, targetLang] = direction.split('-to-');

  console.log('='.repeat(50));
  console.log('[STT] 收到音訊，大小：', audioBuffer.length);
  console.log('[STT] 方向：', direction, '| 來源語言：', sourceLang);

  // 音訊太小可能是靜音，跳過
  if (audioBuffer.length < 1000) {
    console.log('[STT] 音訊太小，跳過');
    return;
  }

  try {
    // 1. STT - 語音辨識（直接用 webm 格式）
    console.log('[STT] 開始語音辨識...');
    const sttResult = await speechToTextFromBuffer(audioBuffer, sourceLang);
    console.log('[STT] 辨識結果：', sttResult.text || '(空)');
    console.log('[STT] 辨識耗時：', sttResult.elapsed, 'ms');

    if (!sttResult.text || sttResult.text.trim() === '') {
      console.log('[STT] 無辨識結果，跳過');
      return;
    }

    // 2. 翻譯
    console.log('[翻譯] 開始翻譯...');
    const translateResult = await translate(sttResult.text, direction);
    console.log('[翻譯] 結果：', translateResult.text);
    console.log('[翻譯] 耗時：', translateResult.elapsed, 'ms');

    // 3. TTS - 暫時關閉，先測試 STT 和字幕
    // const ttsResult = await textToSpeech(translateResult.text, targetLang);

    const totalElapsed = Date.now() - startTime;
    console.log('[完成] 總耗時：', totalElapsed, 'ms');

    // 4. 發送結果給說話者（字幕）
    const mySpeechData = {
      type: 'my-speech',
      originalText: sttResult.text,
      translatedText: translateResult.text,
      latency: {
        stt: sttResult.elapsed,
        translate: translateResult.elapsed,
        total: totalElapsed,
      },
    };
    console.log('[WebSocket] 發送 my-speech 給說話者');
    ws.send(JSON.stringify(mySpeechData));

    // 5. 發送給對方（只有字幕，暫時關閉語音）
    if (socketIO && matchId) {
      const room = socketIO.sockets.adapter.rooms.get(`match:${matchId}`);
      const roomSize = room ? room.size : 0;
      console.log('[Socket] 房間 match:', matchId, '人數：', roomSize);

      if (roomSize > 0) {
        socketIO.to(`match:${matchId}`).emit('voice:translation', {
          from: userId,
          originalText: sttResult.text,
          translatedText: translateResult.text,
          latency: totalElapsed,
        });
        console.log('[Socket] 已發送字幕給對方');
      } else {
        console.log('[Socket] 房間沒有人，無法發送');
      }
    } else {
      console.warn('[Socket] 無法發送: socketIO=', !!socketIO, 'matchId=', matchId);
    }
    console.log('='.repeat(50));

  } catch (error) {
    console.error('[錯誤] 翻譯失敗:', error.message);
    console.error('[錯誤] 堆疊:', error.stack);
    ws.send(JSON.stringify({
      type: 'error',
      message: '翻譯失敗: ' + (error.message || '未知錯誤'),
    }));
  }
}
