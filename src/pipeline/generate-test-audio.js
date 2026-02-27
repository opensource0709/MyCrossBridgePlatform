// src/pipeline/generate-test-audio.js
// 使用 OpenAI TTS 產生測試音檔
import 'dotenv/config';
import OpenAI from 'openai';
import fs from 'fs';
import path from 'path';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const TEST_TEXTS = {
  chinese: '你好，我是來自台灣的男生，我很喜歡越南文化，希望可以認識你',
  vietnamese: 'Xin chào, tôi rất vui được gặp bạn. Tôi muốn học tiếng Trung.',
};

async function generateTestAudio() {
  console.log('🎙️ 開始產生測試音檔...\n');

  // 確保資料夾存在
  const testAudioDir = 'test-audio';
  if (!fs.existsSync(testAudioDir)) {
    fs.mkdirSync(testAudioDir, { recursive: true });
  }

  // 產生中文測試音檔
  console.log('產生中文測試音檔...');
  console.log(`  文字: "${TEST_TEXTS.chinese}"`);

  const chineseResponse = await openai.audio.speech.create({
    model: 'tts-1',
    voice: 'onyx',  // 男聲
    input: TEST_TEXTS.chinese,
  });

  const chinesePath = path.join(testAudioDir, 'chinese_test.mp3');
  const chineseBuffer = Buffer.from(await chineseResponse.arrayBuffer());
  fs.writeFileSync(chinesePath, chineseBuffer);
  console.log(`  ✅ 已儲存: ${chinesePath}\n`);

  // 產生越南文測試音檔
  console.log('產生越南文測試音檔...');
  console.log(`  文字: "${TEST_TEXTS.vietnamese}"`);

  const vietnameseResponse = await openai.audio.speech.create({
    model: 'tts-1',
    voice: 'nova',  // 女聲
    input: TEST_TEXTS.vietnamese,
  });

  const vietnamesePath = path.join(testAudioDir, 'vietnamese_test.mp3');
  const vietnameseBuffer = Buffer.from(await vietnameseResponse.arrayBuffer());
  fs.writeFileSync(vietnamesePath, vietnameseBuffer);
  console.log(`  ✅ 已儲存: ${vietnamesePath}\n`);

  console.log('🎉 測試音檔產生完成！');
  console.log('\n現在可以執行 npm test 來測試 Pipeline');
}

generateTestAudio().catch(console.error);
