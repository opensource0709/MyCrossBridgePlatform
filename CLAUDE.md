# 台越跨語言視訊交流平台 — 專案說明

## 專案定位
AI 驅動的跨語言視訊交流平台，專為台灣男性與越南女性打造。
透過即時雙向語音翻譯消除語言障礙，讓兩人用母語自然對話。

一句話定位：「不需要學越南語，也能和越南女生面對面即時聊天。」
法律定位：語言交換與跨文化交流平台（非交友仲介）

---

## 核心技術 Pipeline
```
說話 → STT → 翻譯 → TTS → 播出
```
- STT：中文用 Whisper、越南文用 Deepgram（智能切換）
- 翻譯：GPT-4o-mini（速度優先）
- TTS：ElevenLabs Streaming API

總延遲目標：< 1.5 秒

---

## 技術選型

| 功能 | 技術 | 說明 |
|------|------|------|
| 語音辨識 (STT) | Whisper + Deepgram | 中文用 Whisper、越南文用 Deepgram |
| 即時翻譯 | GPT-4o-mini | 速度優先，品質仍佳 |
| 語音合成 (TTS) | ElevenLabs API | 最接近真人聲音 |
| 視訊通話 | Agora.io SDK | 台越延遲最低 |
| 後端 | Node.js + Express | Railway |
| 資料庫 | PostgreSQL (Neon) | 新加坡 |
| 前端網頁 | React + Vite | Vercel |
| 前端 App | React Native | Phase 2 |
| 雲端 | Vercel + Railway + Neon | |

---

## 資料夾結構
```
/
├── CLAUDE.md                  ← 本檔案
├── docs/
│   ├── tech-architecture.md   ← 整體架構細節
│   ├── phase0.md              ← Phase 0 開發規格 ✅
│   ├── phase1.md              ← Phase 1 開發規格
│   ├── api-specs.md           ← API 使用規格
│   └── database-schema.md     ← 資料庫設計
├── src/
│   ├── pipeline/              ← 核心翻譯 pipeline ✅
│   │   ├── stt.js             ← STT 智能切換
│   │   ├── translate.js       ← GPT-4o-mini 翻譯
│   │   ├── tts.js             ← ElevenLabs TTS
│   │   └── pipeline.js        ← 整合測試
│   ├── api/                   ← 後端 API ✅
│   │   ├── server.js          ← Express + WebSocket
│   │   ├── db/                ← PostgreSQL 連線
│   │   ├── routes/            ← API 路由
│   │   └── middleware/        ← 認證、錯誤處理
│   ├── video/                 ← Agora 視訊整合 ✅
│   │   └── (整合在 frontend/src/components/VideoCall.jsx)
│   └── ai/                    ← AI 深度功能（Phase 3）
├── frontend/                  ← React 網頁版 ✅
│   └── src/
│       ├── pages/             ← 頁面元件
│       ├── hooks/             ← useAuth 等
│       └── services/          ← API 客戶端
├── app/                       ← React Native App（Phase 2）
└── .env                       ← API Keys（不要 commit）
```

---

## 環境變數 (.env)
```
OPENAI_API_KEY=
ELEVENLABS_API_KEY=
DEEPGRAM_API_KEY=
TRANSLATION_MODEL=gpt-4o-mini
AGORA_APP_ID=
AGORA_APP_CERTIFICATE=
DATABASE_URL=
REDIS_URL=
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
```

---

## 開發階段總覽

| 階段 | 時間 | 目標 | 狀態 |
|------|------|------|------|
| Phase 0 | 第 1～2 週 | 翻譯 Pipeline POC，本地跑通 | ✅ 完成 |
| Phase 1 | 第 1～2 個月 | MVP 網頁版上線，文字翻譯＋基本配對 | ✅ 完成 |
| Phase 2-A | - | Agora 視訊通話整合 | ✅ 完成 |
| Phase 2-B | 第 3～5 個月 | 即時語音翻譯＋App | ⏳ 待開始 |
| Phase 3 | 第 6～9 個月 | AI 記憶庫＋關係教練＋深度功能 | |
| Phase 4 | 第 10～12 個月 | 成長優化、擴展、App 上架 | |

---

## 目前開發階段
**Phase 2-B — 即時語音翻譯整合** ⏳ 待開始

下一步：將語音翻譯 Pipeline 整合到視訊通話中

---

## 線上環境

| 服務 | 網址 | 平台 |
|------|------|------|
| 前端 | https://my-cross-bridge-platform.vercel.app | Vercel |
| 後端 | https://mycrossbridgeplatform-production.up.railway.app | Railway |
| 資料庫 | Neon PostgreSQL（新加坡） | Neon |

---

### 已完成項目

#### Phase 0 — 翻譯 Pipeline POC ✅
- [x] STT 語音辨識（Whisper + Deepgram）
- [x] GPT-4o-mini 即時翻譯
- [x] ElevenLabs TTS 語音合成
- [x] 完整 Pipeline 整合測試

#### Phase 1-A — 延遲優化 ✅
- [x] STT 智能切換（中文 Whisper / 越南文 Deepgram）
- [x] 翻譯改用 GPT-4o-mini + Streaming
- [x] TTS 改用 ElevenLabs Streaming API
- [x] 延遲從 8.6s 優化至 4.8s（改善 44%）

#### Phase 1-B — MVP 網頁版 ✅
- [x] 後端架構（Express + PostgreSQL + WebSocket）
- [x] 資料庫設計（users, profiles, matches, messages）
- [x] JWT 身份驗證（註冊/登入/登出）
- [x] 配對功能（喜歡/跳過/配對成功）
- [x] 探索頁面（瀏覽推薦用戶）
- [x] 即時聊天（WebSocket + 輪詢備援）
- [x] AI 翻譯整合（訊息自動翻譯）
- [x] 個人資料頁（頭像上傳、年齡、自介、興趣標籤）
- [x] 上線部署（Vercel + Railway + Neon）

#### Phase 2-A — Agora 視訊通話 ✅（2026-02-28）
- [x] Agora.io 帳號申請與設定
- [x] 後端 Token 產生 API（/api/agora/token）
- [x] 前端 VideoCall 元件（視訊/語音通話 UI）
- [x] Agora RTC SDK 整合（加入頻道、發布/訂閱媒體流）
- [x] 本地/遠端視訊顯示
- [x] 通話控制（靜音、關閉視訊、結束通話）
- [x] 媒體軌道正確清理（攝影機/麥克風釋放）
- [x] 手機瀏覽器相容性（facingMode、多重配置回退）
- [x] 雙向視訊測試通過（電腦 + 手機）
- [x] 通話邀請/接聽 UI（WebSocket 信令）
  - IncomingCall 元件：來電通知、30秒倒數、接聽/拒絕按鈕
  - OutgoingCall 元件：撥打中畫面、取消按鈕
  - WebSocket 事件：invite, accept, reject, cancel, timeout

#### Phase 2-B — 即時語音翻譯（待開發）
- [ ] 通話中即時語音翻譯整合

#### Phase 1 待辦（未來）
- [ ] 付費訂閱整合

---

## Phase 0 測試結果（2026-02-27）✅

| 方向 | STT | 翻譯 | TTS | 總延遲 |
|------|-----|------|-----|--------|
| 中文→越南文 | 2211ms | 1599ms | 4796ms | **8607ms** |
| 越南文→中文 | 1916ms | 1437ms | 1568ms | **4922ms** |

---

## Phase 1-A 優化結果（2026-02-27）✅

### 已完成的優化
- [x] STT 智能切換：中文用 Whisper、越南文用 Deepgram
- [x] 翻譯改用 GPT-4o-mini + max_tokens 限制
- [x] TTS 改用 ElevenLabs Streaming API

### 延遲測量（優化後）

| 方向 | STT | 翻譯 | TTS首chunk | 感知延遲 | 改善幅度 |
|------|-----|------|------------|----------|----------|
| 中→越 | ~1900ms | ~1200ms | ~1600ms | **~4800ms** | 44% ↓ |
| 越→中 | ~1000ms | ~900ms | ~1300ms | **~3500ms** | 29% ↓ |

目標：< 1500ms（未達標）

### 翻譯品質評估（GPT-4o-mini）

| 項目 | 評分 | 說明 |
|------|------|------|
| 中→越 語意準確度 | 5/5 | 完全正確傳達原意 |
| 中→越 語氣自然度 | 5/5 | 使用「mình」更親切自然 |
| 越→中 語意準確度 | 5/5 | 完全正確 |
| 越→中 語氣自然度 | 5/5 | 自然流暢 |

**測試範例：**
- 原文：「你好，我是來自台灣的男生。我很喜歡越南文化，希望可以認識你。」
- 譯文：「Chào bạn, mình là một chàng trai đến từ Đài Loan. Mình rất thích văn hóa Việt Nam và hy vọng có thể làm quen với bạn.」

### 結論

**瓶頸分析：**
網路延遲是主要瓶頸，HTTP API 調用從台灣到美國服務器的延遲不穩定。

**要達到 < 1.5 秒需要：**
- [ ] 即時串流 STT（WebSocket 連接）
- [ ] 部署到亞洲區服務器（減少網路延遲）
- [ ] 或使用本地部署的 STT/TTS 模型

**建議：**
目前延遲對於「文字翻譯」功能已足夠，可先進入 Phase 1-B 開發 MVP。
「即時語音翻譯」延遲優化留待 Phase 2 與 Agora 視訊整合時一併處理。

---

## 注意事項
- 所有 API Key 放在 .env，絕對不要 hardcode 或 commit
- 翻譯延遲每個環節都要計時，確保總延遲 < 1.5 秒
- 平台收費定位是「翻譯服務訂閱費」，不是「介紹費」，條款措辭要注意
- 越南文 TTS 使用 ElevenLabs，注意 voice ID 要選越南女聲
