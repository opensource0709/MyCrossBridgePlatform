// src/pipeline/tts.js
// 語音合成 - 使用 ElevenLabs Streaming API（低延遲版本）
import { ElevenLabsClient } from '@elevenlabs/elevenlabs-js';
import fs from 'fs';

// 延遲初始化
let client = null;
function getClient() {
  if (!client) {
    client = new ElevenLabsClient({ apiKey: process.env.ELEVENLABS_API_KEY });
  }
  return client;
}

// Voice ID 設定
const VOICE_IDS = {
  vi: 'EXAVITQu4vr4xnSDxMaL',  // 預設 Rachel，之後換越南女聲
  zh: 'pNInz6obpgDQGcFmaJgB',  // 預設 Adam，之後換中文男聲
};

/**
 * 將文字轉換為語音（Streaming 版本 - 低延遲）
 * @param {string} text - 要合成的文字
 * @param {string} language - 語言代碼 ('vi' 或 'zh')
 * @param {string|null} outputPath - 輸出檔案路徑（可選）
 * @returns {Promise<{buffer: Buffer, firstChunkLatency: number, elapsed: number}>}
 */
export async function textToSpeech(text, language = 'vi', outputPath = null) {
  const start = Date.now();

  // 使用 streaming API 降低首個 chunk 延遲
  const audioStream = await getClient().textToSpeech.stream(VOICE_IDS[language], {
    text: text,
    model_id: 'eleven_multilingual_v2',
    voice_settings: {
      stability: 0.5,
      similarity_boost: 0.8,
    },
  });

  // 追蹤首個 chunk 的時間（用戶開始聽到聲音的時間）
  let firstChunkTime = null;
  const chunks = [];

  for await (const chunk of audioStream) {
    if (!firstChunkTime) {
      firstChunkTime = Date.now() - start;
      console.log(`[TTS] 首個 chunk 延遲: ${firstChunkTime}ms`);
    }
    chunks.push(chunk);
  }

  const buffer = Buffer.concat(chunks);
  const elapsed = Date.now() - start;
  console.log(`[TTS] 總耗時: ${elapsed}ms | 語言: ${language}`);

  // 如果有指定輸出路徑就存檔
  if (outputPath) {
    fs.writeFileSync(outputPath, buffer);
  }

  return {
    buffer,
    firstChunkLatency: firstChunkTime,
    elapsed,
  };
}
