# Phase 0 — 核心 Pipeline 驗證

## 目標
在本地端跑通完整的中越雙向語音翻譯 Pipeline，證明技術可行，測量實際延遲。

預計時間：6～8 小時
預計費用：< 2 萬 TWD（API 測試用量極少）

---

## 完成標準

- [ ] 輸入中文語音 → 輸出越南文語音，全程延遲 < 1.5 秒
- [ ] 輸入越南文語音 → 輸出中文語音，全程延遲 < 1.5 秒
- [ ] 每個環節的延遲都有 log 記錄
- [ ] 翻譯品質人工確認正確

---

## 前置作業

### 需要申請的帳號
1. OpenAI API — https://platform.openai.com（已有）
2. ElevenLabs API — https://elevenlabs.io（免費額度夠用）
3. Agora.io 開發者帳號 — https://console.agora.io（Phase 0 暫時不需要，Phase 2 才用）

### 安裝環境
```bash
node -v   # 確認 Node.js 已安裝，建議 v20+
npm -v
```

---

## 專案初始化

```bash
mkdir lianyue-platform
cd lianyue-platform
npm init -y
npm install openai elevenlabs dotenv
```

建立 `.env`：
```
OPENAI_API_KEY=你的key
ELEVENLABS_API_KEY=你的key
```

建立 `.gitignore`：
```
.env
node_modules/
output/
*.mp3
*.wav
```

---

## Pipeline 架構

```
[輸入語音檔 .mp3/.wav]
         ↓
    Step 1: STT
    Whisper API
    輸出：文字
         ↓
    Step 2: 翻譯
    GPT-4o
    輸出：譯文
         ↓
    Step 3: TTS
    ElevenLabs
    輸出：語音檔 .mp3
         ↓
[播放輸出語音]
```

---

## 程式碼規格

### 檔案結構
```
src/pipeline/
├── stt.js        ← Whisper 語音辨識
├── translate.js  ← GPT-4o 翻譯
├── tts.js        ← ElevenLabs 語音合成
├── pipeline.js   ← 整合三個步驟
└── test.js       ← 測試用主程式
```

---

### Step 1: stt.js — 語音辨識

功能：接收音檔路徑，回傳辨識文字與耗時

```javascript
// src/pipeline/stt.js
import OpenAI from 'openai';
import fs from 'fs';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function speechToText(audioFilePath, language = 'zh') {
  const start = Date.now();
  
  const transcription = await openai.audio.transcriptions.create({
    file: fs.createReadStream(audioFilePath),
    model: 'whisper-1',
    language: language,  // 'zh' 中文 / 'vi' 越南文
  });
  
  const elapsed = Date.now() - start;
  console.log(`[STT] 耗時: ${elapsed}ms | 結果: ${transcription.text}`);
  
  return {
    text: transcription.text,
    elapsed,
  };
}
```

---

### Step 2: translate.js — 翻譯

功能：接收文字與語言方向，回傳譯文與耗時

```javascript
// src/pipeline/translate.js
import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const PROMPTS = {
  'zh-to-vi': `你是一個專業的中文到越南文翻譯。
請將用戶輸入的中文翻譯成自然流暢的越南文。
語氣要友善、自然，像朋友之間的對話。
只輸出譯文，不要加任何解釋或備注。`,

  'vi-to-zh': `Bạn là một dịch giả chuyên nghiệp từ tiếng Việt sang tiếng Trung.
Hãy dịch văn bản tiếng Việt của người dùng sang tiếng Trung tự nhiên.
Giọng điệu thân thiện, tự nhiên như cuộc trò chuyện giữa bạn bè.
Chỉ xuất bản dịch, không thêm giải thích.`,
};

export async function translate(text, direction = 'zh-to-vi') {
  const start = Date.now();
  
  const completion = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: PROMPTS[direction] },
      { role: 'user', content: text },
    ],
    temperature: 0.3,  // 低一點，翻譯要精準
  });
  
  const translated = completion.choices[0].message.content.trim();
  const elapsed = Date.now() - start;
  console.log(`[翻譯] 耗時: ${elapsed}ms | ${text} → ${translated}`);
  
  return {
    text: translated,
    elapsed,
  };
}
```

---

### Step 3: tts.js — 語音合成

功能：接收文字與語言，回傳音檔 Buffer 與耗時

```javascript
// src/pipeline/tts.js
import ElevenLabs from 'elevenlabs';
import fs from 'fs';

const client = new ElevenLabs({ apiKey: process.env.ELEVENLABS_API_KEY });

// Voice ID 要去 ElevenLabs 後台選
// 建議：越南女聲選 Rachel 或找越南語 voice
const VOICE_IDS = {
  vi: 'EXAVITQu4vr4xnSDxMaL',  // 先用預設，之後換越南女聲
  zh: 'pNInz6obpgDQGcFmaJgB',  // 中文男聲
};

export async function textToSpeech(text, language = 'vi', outputPath = null) {
  const start = Date.now();
  
  const audio = await client.generate({
    voice: VOICE_IDS[language],
    text: text,
    model_id: 'eleven_multilingual_v2',  // 支援越南文
  });
  
  // 收集 stream 成 Buffer
  const chunks = [];
  for await (const chunk of audio) {
    chunks.push(chunk);
  }
  const buffer = Buffer.concat(chunks);
  
  // 如果有指定輸出路徑就存檔
  if (outputPath) {
    fs.writeFileSync(outputPath, buffer);
  }
  
  const elapsed = Date.now() - start;
  console.log(`[TTS] 耗時: ${elapsed}ms | 語言: ${language}`);
  
  return { buffer, elapsed };
}
```

---

### Step 4: pipeline.js — 整合

```javascript
// src/pipeline/pipeline.js
import 'dotenv/config';
import { speechToText } from './stt.js';
import { translate } from './translate.js';
import { textToSpeech } from './tts.js';

export async function runPipeline(audioFilePath, direction = 'zh-to-vi') {
  console.log('\n=== Pipeline 開始 ===');
  const totalStart = Date.now();
  
  const sourceLang = direction === 'zh-to-vi' ? 'zh' : 'vi';
  const targetLang = direction === 'zh-to-vi' ? 'vi' : 'zh';
  
  // Step 1: 語音辨識
  const sttResult = await speechToText(audioFilePath, sourceLang);
  
  // Step 2: 翻譯
  const translateResult = await translate(sttResult.text, direction);
  
  // Step 3: 語音合成
  const outputPath = `output/result_${Date.now()}.mp3`;
  const ttsResult = await textToSpeech(translateResult.text, targetLang, outputPath);
  
  const totalElapsed = Date.now() - totalStart;
  
  console.log('\n=== Pipeline 結果 ===');
  console.log(`原文：${sttResult.text}`);
  console.log(`譯文：${translateResult.text}`);
  console.log(`輸出檔案：${outputPath}`);
  console.log(`\n延遲分析：`);
  console.log(`  STT:      ${sttResult.elapsed}ms`);
  console.log(`  翻譯:     ${translateResult.elapsed}ms`);
  console.log(`  TTS:      ${ttsResult.elapsed}ms`);
  console.log(`  總延遲:   ${totalElapsed}ms`);
  console.log(`  目標:     < 1500ms`);
  console.log(`  結果:     ${totalElapsed < 1500 ? '✅ 達標' : '❌ 未達標，需優化'}`);
  
  return {
    sourceText: sttResult.text,
    translatedText: translateResult.text,
    outputPath,
    latency: {
      stt: sttResult.elapsed,
      translate: translateResult.elapsed,
      tts: ttsResult.elapsed,
      total: totalElapsed,
    }
  };
}
```

---

### Step 5: test.js — 測試

```javascript
// src/pipeline/test.js
import 'dotenv/config';
import { runPipeline } from './pipeline.js';
import fs from 'fs';

// 確保 output 資料夾存在
if (!fs.existsSync('output')) fs.mkdirSync('output');

// 測試 1：中文 → 越南文
console.log('\n【測試 1】中文 → 越南文');
await runPipeline('test-audio/chinese_test.mp3', 'zh-to-vi');

// 測試 2：越南文 → 中文
console.log('\n【測試 2】越南文 → 中文');
await runPipeline('test-audio/vietnamese_test.mp3', 'vi-to-zh');
```

---

## 測試音檔準備

先用文字轉語音工具準備測試音檔，放在 `test-audio/` 資料夾：

- `chinese_test.mp3`：一段中文語音，例如「你好，我是來自台灣的男生，我很喜歡越南文化」
- `vietnamese_test.mp3`：一段越南文語音

可以用 macOS 的 `say` 指令快速產生：
```bash
say -v Mei-Jia "你好，我是來自台灣的男生，我很喜歡越南文化" -o test-audio/chinese_test.aiff
ffmpeg -i test-audio/chinese_test.aiff test-audio/chinese_test.mp3
```

---

## 執行方式

```bash
# package.json 加入
"type": "module"

# 執行測試
node src/pipeline/test.js
```

---

## 延遲優化方向（如果超過 1.5 秒）

| 問題 | 對策 |
|------|------|
| STT 太慢 | 改用串流模式（Whisper streaming） |
| 翻譯太慢 | 調低 max_tokens，或換 GPT-4o-mini 測試 |
| TTS 太慢 | 改用 ElevenLabs streaming API |
| 整體太慢 | STT 結束後立即並行啟動翻譯，不要等全部完成 |

---

## Phase 0 完成後，下一步

Phase 0 跑通後，立即記錄：
1. 實際測到的各環節延遲數字
2. 翻譯品質主觀評估（1～5 分）
3. 遇到的問題與解法

然後更新 CLAUDE.md，準備進入 Phase 1。
