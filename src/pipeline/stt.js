// src/pipeline/stt.js
// 語音辨識 - 智能切換引擎
// 越南文用 Deepgram（快），中文用 Whisper（準）
import { createClient } from '@deepgram/sdk';
import OpenAI from 'openai';
import fs from 'fs';

// 延遲初始化，避免在 import 時就需要 API Key
let deepgram = null;
let openai = null;

function getDeepgram() {
  if (!deepgram) {
    deepgram = createClient(process.env.DEEPGRAM_API_KEY);
  }
  return deepgram;
}

function getOpenAI() {
  if (!openai) {
    openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return openai;
}

const DEEPGRAM_LANGUAGE_MAP = {
  vi: 'vi',      // 越南文 - Deepgram 表現好
  th: 'th',      // 泰語
};

/**
 * 將語音檔案轉換為文字（智能選擇引擎）
 * @param {string|Buffer} audioInput - 音檔路徑或 Buffer
 * @param {string} language - 語言代碼 ('zh' 中文 / 'vi' 越南文)
 * @returns {Promise<{text: string, elapsed: number, engine: string}>}
 */
export async function speechToText(audioInput, language = 'zh') {
  // 根據語言選擇最佳引擎
  if (DEEPGRAM_LANGUAGE_MAP[language]) {
    return speechToTextDeepgram(audioInput, language);
  } else {
    return speechToTextWhisper(audioInput, language);
  }
}

/**
 * 從 Buffer 進行語音辨識（給 WebSocket 使用）
 * @param {Buffer} audioBuffer - 音訊 Buffer
 * @param {string} language - 語言代碼
 * @returns {Promise<{text: string, elapsed: number, engine: string}>}
 */
export async function speechToTextFromBuffer(audioBuffer, language = 'zh') {
  if (DEEPGRAM_LANGUAGE_MAP[language]) {
    return speechToTextDeepgramBuffer(audioBuffer, language);
  } else {
    return speechToTextWhisperBuffer(audioBuffer, language);
  }
}

/**
 * Deepgram STT（越南文較快）
 */
async function speechToTextDeepgram(audioFilePath, language) {
  const start = Date.now();

  const { result } = await getDeepgram().listen.prerecorded.transcribeFile(
    fs.readFileSync(audioFilePath),
    {
      model: 'nova-2',
      language: DEEPGRAM_LANGUAGE_MAP[language],
      smart_format: true,
    }
  );

  const text = result.results.channels[0].alternatives[0].transcript;
  const elapsed = Date.now() - start;
  console.log(`[STT-Deepgram] 耗時: ${elapsed}ms | 結果: ${text}`);

  return { text, elapsed, engine: 'deepgram' };
}

/**
 * Whisper STT（中文較準）
 */
async function speechToTextWhisper(audioFilePath, language) {
  const start = Date.now();

  const transcription = await getOpenAI().audio.transcriptions.create({
    file: fs.createReadStream(audioFilePath),
    model: 'whisper-1',
    language: language,
  });

  const elapsed = Date.now() - start;
  console.log(`[STT-Whisper] 耗時: ${elapsed}ms | 結果: ${transcription.text}`);

  return { text: transcription.text, elapsed, engine: 'whisper' };
}

/**
 * Deepgram STT 從 Buffer（WebSocket 用）
 */
async function speechToTextDeepgramBuffer(audioBuffer, language) {
  const start = Date.now();

  const { result } = await getDeepgram().listen.prerecorded.transcribeFile(
    audioBuffer,
    {
      model: 'nova-2',
      language: DEEPGRAM_LANGUAGE_MAP[language],
      smart_format: true,
      mimetype: 'audio/webm',
    }
  );

  const text = result.results?.channels?.[0]?.alternatives?.[0]?.transcript || '';
  const elapsed = Date.now() - start;
  console.log(`[STT-Deepgram-Buffer] 耗時: ${elapsed}ms | 結果: ${text}`);

  return { text, elapsed, engine: 'deepgram' };
}

/**
 * Whisper STT 從 Buffer（WebSocket 用）
 */
async function speechToTextWhisperBuffer(audioBuffer, language) {
  const start = Date.now();

  // Whisper 需要檔案，所以創建一個 File-like 物件
  const file = new File([audioBuffer], 'audio.webm', { type: 'audio/webm' });

  const transcription = await getOpenAI().audio.transcriptions.create({
    file: file,
    model: 'whisper-1',
    language: language,
  });

  const elapsed = Date.now() - start;
  console.log(`[STT-Whisper-Buffer] 耗時: ${elapsed}ms | 結果: ${transcription.text}`);

  return { text: transcription.text, elapsed, engine: 'whisper' };
}
