# Phase 1 — 延遲優化 + MVP 網頁版

## 目標
1. 先解決延遲問題，把總延遲從 8607ms 降到 < 1500ms
2. 建立 MVP 網頁版，文字翻譯 + 基本配對功能上線

預計時間：第 1～2 個月
預計費用：30～40 萬 TWD

---

## Phase 1-A：延遲優化（優先，第 1～2 週）

**目標：總延遲 < 1500ms**

目前問題分析：

| 環節 | 目前 | 目標 | 問題原因 |
|------|------|------|---------|
| STT | 2211ms | < 300ms | Whisper 非串流，等整段辨識完 |
| 翻譯 | 1599ms | < 500ms | 等 STT 完成才開始 |
| TTS | 4796ms | < 300ms | ElevenLabs 非串流，等整段生成完 |
| 總計 | 8607ms | < 1500ms | 三段串行，沒有並行 |

---

### 優化方案一：TTS 改 Streaming（最優先，效果最大）

TTS 是最大瓶頸，從 4796ms 改成 streaming 後預計降到 300ms。

```javascript
// src/pipeline/tts.js — 改成 streaming 版本
export async function textToSpeechStream(text, language = 'vi') {
  const start = Date.now();

  const audioStream = await client.textToSpeech.stream(VOICE_IDS[language], {
    text: text,
    model_id: 'eleven_multilingual_v2',
    voice_settings: {
      stability: 0.5,
      similarity_boost: 0.8,
    }
  });

  // 拿到第一個 chunk 的時間就是用戶開始聽到聲音的時間
  let firstChunkTime = null;
  const chunks = [];

  for await (const chunk of audioStream) {
    if (!firstChunkTime) {
      firstChunkTime = Date.now() - start;
      console.log(`[TTS] 首個 chunk 延遲: ${firstChunkTime}ms`);
    }
    chunks.push(chunk);
  }

  const elapsed = Date.now() - start;
  console.log(`[TTS] 總耗時: ${elapsed}ms`);

  return {
    buffer: Buffer.concat(chunks),
    firstChunkLatency: firstChunkTime,
    elapsed,
  };
}
```

---

### 優化方案二：STT 換 Deepgram

Whisper 平均 2211ms，Deepgram 串流辨識可以降到 200～300ms。

```bash
npm install @deepgram/sdk
```

```javascript
// src/pipeline/stt.js — 改成 Deepgram 版本
import { createClient } from '@deepgram/sdk';
import fs from 'fs';

const deepgram = createClient(process.env.DEEPGRAM_API_KEY);

export async function speechToText(audioFilePath, language = 'zh') {
  const start = Date.now();

  const LANGUAGE_MAP = {
    zh: 'zh-TW',   // 台灣繁體中文
    vi: 'vi',      // 越南文
    th: 'th',      // 泰語
  };

  const { result } = await deepgram.listen.prerecorded.transcribeFile(
    fs.readFileSync(audioFilePath),
    {
      model: 'nova-2',
      language: LANGUAGE_MAP[language],
      smart_format: true,
    }
  );

  const text = result.results.channels[0].alternatives[0].transcript;
  const elapsed = Date.now() - start;
  console.log(`[STT] 耗時: ${elapsed}ms | 結果: ${text}`);

  return { text, elapsed };
}
```

新增環境變數：
```
DEEPGRAM_API_KEY=你的key
```

申請：https://console.deepgram.com（有免費額度 $200 USD）

---

### 優化方案三：Pipeline 改並行處理

現在三個步驟是串行的，改成 STT 完成後立刻觸發翻譯，翻譯完成後立刻觸發 TTS。

```javascript
// src/pipeline/pipeline.js — 優化版
export async function runPipeline(audioFilePath, direction = 'zh-to-vi') {
  console.log('\n=== Pipeline 開始（優化版）===');
  const totalStart = Date.now();

  const sourceLang = direction.split('-to-')[0];
  const targetLang = direction.split('-to-')[1];

  // Step 1: STT
  const sttResult = await speechToText(audioFilePath, sourceLang);
  const sttDone = Date.now();

  // Step 2: 翻譯（STT 完成立刻開始，不等其他東西）
  const translateResult = await translate(sttResult.text, direction);
  const translateDone = Date.now();

  // Step 3: TTS Streaming（翻譯完成立刻開始生成+播放）
  const ttsResult = await textToSpeechStream(translateResult.text, targetLang);
  const ttsDone = Date.now();

  const totalElapsed = Date.now() - totalStart;

  console.log('\n=== 延遲分析 ===');
  console.log(`STT:        ${sttDone - totalStart}ms`);
  console.log(`翻譯:       ${translateDone - sttDone}ms`);
  console.log(`TTS首chunk: ${ttsResult.firstChunkLatency}ms`);
  console.log(`總延遲:     ${totalElapsed}ms`);
  console.log(`達標:       ${totalElapsed < 1500 ? '✅' : '❌'}`);

  return {
    sourceText: sttResult.text,
    translatedText: translateResult.text,
    latency: {
      stt: sttDone - totalStart,
      translate: translateDone - sttDone,
      ttsFirstChunk: ttsResult.firstChunkLatency,
      total: totalElapsed,
    }
  };
}
```

---

### 優化方案四：翻譯加速（如果還不夠快）

GPT-4o 翻譯目前 1599ms，可以試試換 GPT-4o-mini 看品質是否可接受：

```javascript
// translate.js — 加入模型切換選項
const completion = await openai.chat.completions.create({
  model: process.env.TRANSLATION_MODEL || 'gpt-4o',  // 可用環境變數切換
  max_tokens: 300,   // 對話短句不需要太多
  temperature: 0.3,
});
```

在 .env 加入：
```
TRANSLATION_MODEL=gpt-4o-mini  # 測試用，確認品質後再決定
```

---

### 優化後預期延遲

| 環節 | 優化前 | 優化後（預估） |
|------|--------|--------------|
| STT (Deepgram) | 2211ms | ~250ms |
| 翻譯 (GPT-4o) | 1599ms | ~500ms |
| TTS 首chunk | 4796ms | ~300ms |
| **總計** | **8607ms** | **~1050ms ✅** |

---

## Phase 1-A 完成標準

- [ ] 總延遲 < 1500ms（中文→越南文）
- [ ] 總延遲 < 1500ms（越南文→中文）
- [ ] 翻譯品質維持 4/5 以上
- [ ] 更新 CLAUDE.md 記錄新的延遲數字

完成後立刻進入 Phase 1-B。

---

## Phase 1-B：MVP 網頁版（第 2～8 週）

**目標：可以給真實用戶試用的基本功能**

---

### 後端架構建立（第 2 週）

```bash
# 初始化後端
mkdir src/api
cd src/api
npm init -y
npm install express jsonwebtoken bcrypt pg ioredis cors helmet dotenv multer socket.io
```

**主要檔案結構：**
```
src/api/
├── server.js           ← Express 主程式
├── routes/
│   ├── auth.js         ← 註冊/登入
│   ├── users.js        ← 用戶資料
│   ├── matching.js     ← 配對
│   └── messages.js     ← 訊息
├── middleware/
│   ├── auth.js         ← JWT 驗證
│   └── rateLimit.js    ← 限流
├── models/
│   ├── User.js
│   ├── Match.js
│   └── Message.js
└── db/
    ├── connection.js   ← PostgreSQL 連線
    └── schema.sql      ← 資料庫結構
```

---

### 資料庫 Schema（第 2 週）

```sql
-- 用戶表
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(10) NOT NULL CHECK (role IN ('taiwan', 'vietnam')),
  created_at TIMESTAMP DEFAULT NOW()
);

-- 個人資料
CREATE TABLE profiles (
  user_id UUID PRIMARY KEY REFERENCES users(id),
  display_name VARCHAR(50) NOT NULL,
  age INTEGER,
  location VARCHAR(100),
  bio TEXT,
  interests TEXT[],          -- 興趣標籤陣列
  avatar_url VARCHAR(500),
  is_verified BOOLEAN DEFAULT FALSE,
  is_online BOOLEAN DEFAULT FALSE,
  last_seen TIMESTAMP
);

-- 配對關係
CREATE TABLE matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_a UUID REFERENCES users(id),
  user_b UUID REFERENCES users(id),
  status VARCHAR(20) DEFAULT 'pending',  -- pending/matched/blocked
  created_at TIMESTAMP DEFAULT NOW()
);

-- 訊息（含翻譯）
CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id UUID REFERENCES matches(id),
  sender_id UUID REFERENCES users(id),
  original_text TEXT NOT NULL,
  translated_text TEXT,
  source_lang VARCHAR(5),
  target_lang VARCHAR(5),
  created_at TIMESTAMP DEFAULT NOW()
);
```

---

### API 端點規格（第 3 週）

**認證**
```
POST /api/auth/register    用戶註冊
POST /api/auth/login       用戶登入
POST /api/auth/refresh     刷新 Token
```

**用戶**
```
GET  /api/users/me         取得自己的資料
PUT  /api/users/me         更新個人資料
POST /api/users/me/avatar  上傳頭像
```

**配對**
```
GET  /api/matching/suggestions   取得推薦對象列表
POST /api/matching/like/:userId  喜歡某人
POST /api/matching/skip/:userId  略過某人
GET  /api/matching/matches       取得已配對列表
```

**訊息**
```
GET  /api/messages/:matchId      取得對話紀錄
POST /api/messages/:matchId      發送訊息（含 AI 翻譯）
```

---

### 前端網頁版（第 4～6 週）

```bash
# 初始化 React 專案
npm create vite@latest frontend -- --template react
cd frontend
npm install axios socket.io-client react-router-dom
```

**主要頁面：**
```
pages/
├── Landing.jsx       ← 首頁/介紹頁
├── Register.jsx      ← 註冊
├── Login.jsx         ← 登入
├── Discovery.jsx     ← 配對瀏覽（Gemini 設計稿參考）
├── Chat.jsx          ← 文字聊天翻譯（Gemini 設計稿參考）
└── Profile.jsx       ← 個人資料
```

**設計參考：** `docs/` 資料夾中的 Gemini 介面設計稿
- 配對頁：AI 媒合度百分比、雙語標籤、真人驗證標章
- 聊天頁：左邊越南文原文+中文字幕、右邊輸入框+語氣建議

---

### WebSocket 即時訊息（第 5 週）

```javascript
// src/api/websocket.js
import { Server } from 'socket.io';

export function initWebSocket(httpServer) {
  const io = new Server(httpServer, {
    cors: { origin: process.env.FRONTEND_URL }
  });

  io.use(authMiddleware);  // JWT 驗證

  io.on('connection', (socket) => {
    // 用戶上線
    socket.on('user:online', async (userId) => {
      await updateOnlineStatus(userId, true);
      socket.join(`user:${userId}`);
    });

    // 發送訊息（含 AI 翻譯）
    socket.on('message:send', async ({ matchId, text }) => {
      const translated = await translate(text, direction);
      const message = await saveMessage({ matchId, text, translated });

      // 傳給對方
      io.to(`user:${recipientId}`).emit('message:received', message);
    });

    // 用戶離線
    socket.on('disconnect', async () => {
      await updateOnlineStatus(socket.userId, false);
    });
  });
}
```

---

### 真人驗證整合（第 6 週）

使用 Veriff 或 Sumsub 做臉部驗證：

```bash
npm install @sumsub/websdk-react
```

驗證流程：
```
用戶上傳自拍 → 第三方 AI 驗證 → 回傳結果 → 更新 is_verified
```

免費方案：Sumsub 有免費額度，夠 MVP 測試用

---

### 詐騙偵測基礎版（第 6 週）

```javascript
// src/api/middleware/fraudDetection.js
// 簡單規則版，Phase 3 再升級成 AI 版

const FRAUD_RULES = [
  { pattern: /line|whatsapp|telegram|wechat/i, score: 30 },  // 要求加外部通訊
  { pattern: /\d{4,}/g, score: 20 },                          // 大量數字（電話/帳號）
  { pattern: /money|錢|transfer|匯款/i, score: 50 },           // 金錢相關
];

export function calculateFraudScore(text) {
  let score = 0;
  for (const rule of FRAUD_RULES) {
    if (rule.pattern.test(text)) score += rule.score;
  }
  return score;  // > 50 自動警告，> 80 自動封鎖
}
```

---

## Phase 1-B 完成標準

- [ ] 用戶可以註冊/登入（台灣端、越南端）
- [ ] 可以瀏覽配對建議列表
- [ ] 可以發送訊息並看到 AI 翻譯
- [ ] 基本詐騙偵測運作
- [ ] 部署到 AWS，有公開網址可以給測試者試用

---

## 部署（第 7～8 週）

```
AWS 最小配置（Phase 1）：
- EC2 t3.small     ~$15 USD/月
- RDS db.t3.micro  ~$15 USD/月
- ElastiCache      ~$15 USD/月
- S3               ~$1 USD/月
合計：~$46 USD/月（約 1,500 TWD）
```

---

## Phase 1 完成後，更新 CLAUDE.md

Phase 1 全部完成後，請 Claude Code 更新 CLAUDE.md：
- 記錄優化後的實際延遲數字
- 記錄 MVP 上線後的測試用戶反饋
- 更新目前開發階段為 Phase 2
- 記錄任何技術債或待解決問題
