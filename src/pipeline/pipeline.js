// src/pipeline/pipeline.js
// 整合 STT → 翻譯 → TTS 的完整 Pipeline（優化版）
import 'dotenv/config';
import { speechToText } from './stt.js';
import { translate } from './translate.js';
import { textToSpeech } from './tts.js';

/**
 * 執行完整的語音翻譯 Pipeline（優化版）
 * @param {string} audioFilePath - 輸入音檔路徑
 * @param {string} direction - 翻譯方向 ('zh-to-vi' 或 'vi-to-zh')
 * @returns {Promise<object>}
 */
export async function runPipeline(audioFilePath, direction = 'zh-to-vi') {
  console.log('\n=== Pipeline 開始（優化版）===');
  console.log(`輸入: ${audioFilePath}`);
  console.log(`方向: ${direction}`);
  const totalStart = Date.now();

  const sourceLang = direction.split('-to-')[0];
  const targetLang = direction.split('-to-')[1];

  // Step 1: STT (Deepgram)
  const sttResult = await speechToText(audioFilePath, sourceLang);
  const sttDone = Date.now();

  // Step 2: 翻譯 (GPT-4o)
  const translateResult = await translate(sttResult.text, direction);
  const translateDone = Date.now();

  // Step 3: TTS Streaming (ElevenLabs)
  const outputPath = `output/result_${Date.now()}.mp3`;
  const ttsResult = await textToSpeech(translateResult.text, targetLang, outputPath);
  const ttsDone = Date.now();

  const totalElapsed = Date.now() - totalStart;

  // 計算「用戶感知延遲」= STT + 翻譯 + TTS首個chunk
  const perceivedLatency = (sttDone - totalStart) + (translateDone - sttDone) + ttsResult.firstChunkLatency;

  // 結果報告
  console.log('\n=== Pipeline 結果 ===');
  console.log(`原文：${sttResult.text}`);
  console.log(`譯文：${translateResult.text}`);
  console.log(`輸出檔案：${outputPath}`);
  console.log(`\n延遲分析：`);
  console.log(`  STT:          ${sttDone - totalStart}ms`);
  console.log(`  翻譯:         ${translateDone - sttDone}ms`);
  console.log(`  TTS首chunk:   ${ttsResult.firstChunkLatency}ms`);
  console.log(`  TTS總耗時:    ${ttsResult.elapsed}ms`);
  console.log(`  ─────────────────────`);
  console.log(`  用戶感知延遲: ${perceivedLatency}ms`);
  console.log(`  總處理時間:   ${totalElapsed}ms`);
  console.log(`  目標:         < 1500ms`);
  console.log(`  結果:         ${perceivedLatency < 1500 ? '✅ 達標' : '❌ 未達標'}`);

  return {
    sourceText: sttResult.text,
    translatedText: translateResult.text,
    outputPath,
    latency: {
      stt: sttDone - totalStart,
      translate: translateDone - sttDone,
      ttsFirstChunk: ttsResult.firstChunkLatency,
      ttsTotal: ttsResult.elapsed,
      perceived: perceivedLatency,
      total: totalElapsed,
    }
  };
}
