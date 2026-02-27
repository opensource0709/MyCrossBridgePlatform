# 系統技術架構

## 整體架構圖

```
┌─────────────────────────────────────────────────────────┐
│                        前端層                            │
│  React 網頁版 (Phase 1)   React Native App (Phase 2)    │
└────────────────────┬────────────────────────────────────┘
                     │ HTTPS / WebSocket
┌────────────────────▼────────────────────────────────────┐
│                       後端層                             │
│                                                         │
│  ┌─────────────┐  ┌──────────────┐  ┌───────────────┐  │
│  │  API Server │  │  WebSocket   │  │   Pipeline    │  │
│  │  (REST API) │  │  Server      │  │   Server      │  │
│  │  Node.js    │  │  (即時訊息)   │  │  (翻譯處理)   │  │
│  └─────────────┘  └──────────────┘  └───────────────┘  │
└────────────────────┬────────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────────┐
│                     AI / API 層                          │
│                                                         │
│  Whisper API    GPT-4o        ElevenLabs    Agora.io    │
│  (語音辨識)     (翻譯/AI)      (語音合成)    (視訊)      │
└────────────────────┬────────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────────┐
│                      資料層                              │
│                                                         │
│  PostgreSQL         Redis              AWS S3           │
│  (主要資料)         (快取/Session)      (媒體檔案)        │
└─────────────────────────────────────────────────────────┘
```

---

## 核心翻譯 Pipeline

```
用戶說話（麥克風）
      ↓
前端錄音（WebRTC / React Native Audio）
      ↓ 傳送音檔
Pipeline Server
      ↓
  [STT] Whisper API          目標 < 300ms
      ↓ 辨識文字
  [翻譯] GPT-4o              目標 < 500ms
      ↓ 譯文
  [TTS] ElevenLabs           目標 < 300ms
      ↓ 語音串流
前端播放翻譯語音
      ↓
同時視訊畫面疊加雙語字幕

總延遲目標：< 1.5 秒
```

---

## 資料夾結構（完整）

```
lianyue-platform/
│
├── CLAUDE.md                    ← Claude Code 主說明
│
├── docs/
│   ├── tech-architecture.md     ← 本檔案
│   ├── phase0.md                ← Phase 0 開發規格
│   ├── phase1.md                ← Phase 1 開發規格（Phase 1 時產生）
│   ├── api-specs.md             ← API 使用規格
│   └── database-schema.md       ← 資料庫設計（Phase 1 時產生）
│
├── src/
│   ├── pipeline/                ← 核心翻譯 pipeline（Phase 0）
│   │   ├── stt.js               ← Whisper 語音辨識
│   │   ├── translate.js         ← GPT-4o 翻譯
│   │   ├── tts.js               ← ElevenLabs 語音合成
│   │   ├── pipeline.js          ← 整合三個步驟
│   │   └── test.js              ← 測試用主程式
│   │
│   ├── api/                     ← 後端 REST API（Phase 1）
│   │   ├── routes/
│   │   │   ├── auth.js          ← 註冊/登入
│   │   │   ├── users.js         ← 用戶資料
│   │   │   ├── matching.js      ← 配對邏輯
│   │   │   └── messages.js      ← 訊息
│   │   ├── middleware/
│   │   │   ├── auth.js          ← JWT 驗證
│   │   │   └── rateLimit.js     ← API 限流
│   │   └── server.js            ← Express 主程式
│   │
│   ├── websocket/               ← 即時訊息（Phase 1）
│   │   └── server.js
│   │
│   ├── video/                   ← Agora 視訊整合（Phase 2）
│   │   └── agora.js
│   │
│   ├── ai/                      ← AI 深度功能（Phase 3）
│   │   ├── memory.js            ← AI 記憶庫
│   │   ├── summary.js           ← 對話摘要
│   │   └── coach.js             ← 關係教練
│   │
│   └── matching/                ← 配對演算法（Phase 1）
│       └── algorithm.js
│
├── frontend/                    ← React 網頁版（Phase 1）
│   ├── src/
│   │   ├── pages/
│   │   ├── components/
│   │   └── App.jsx
│   └── package.json
│
├── app/                         ← React Native App（Phase 2）
│   ├── src/
│   └── package.json
│
├── test-audio/                  ← Phase 0 測試用音檔
│   ├── chinese_test.mp3
│   └── vietnamese_test.mp3
│
├── output/                      ← Pipeline 輸出（不 commit）
│
├── .env                         ← API Keys（不 commit）
├── .gitignore
└── package.json
```

---

## 後端技術規格

### Node.js + Express（API Server）
```javascript
// 主要套件
express          // HTTP 框架
jsonwebtoken     // JWT 認證
bcrypt           // 密碼加密
pg               // PostgreSQL 連線
ioredis          // Redis 連線
multer           // 檔案上傳
cors             // CORS 設定
helmet           // 安全性 headers
```

### WebSocket Server（即時訊息）
```javascript
// 使用 Socket.io
socket.io        // WebSocket 框架

// 主要事件
'message:send'        // 發送訊息
'message:received'    // 收到訊息
'translation:start'   // 開始翻譯
'translation:done'    // 翻譯完成
'user:online'         // 用戶上線
'user:offline'        // 用戶離線
```

---

## 資料庫規格（概覽）

Phase 1 時會產生詳細的 `database-schema.md`，這裡先列主要資料表：

```
users              用戶資料（台灣端/越南端）
profiles           個人資料、興趣標籤
matches            配對關係
messages           聊天訊息（含翻譯）
calls              通話記錄
gifts              虛擬禮物紀錄
subscriptions      訂閱狀態
```

---

## AWS 架構（Phase 1 開始）

```
Route 53          域名 DNS
    ↓
CloudFront        CDN 加速（台灣/越南）
    ↓
Application Load Balancer
    ↓
EC2 (t3.medium)   Node.js 後端
    ↓
RDS (PostgreSQL)  主要資料庫
ElastiCache       Redis 快取
S3                用戶照片/音檔
```

**Phase 0 不需要 AWS，全部在本地端跑。**

---

## 安全性規範

- 所有 API Key 放在 .env，不得 hardcode
- JWT Token 有效期：Access Token 1小時，Refresh Token 30天
- 密碼用 bcrypt hash，salt rounds = 12
- API 加入 rate limiting（防止濫用）
- 用戶上傳的音檔不長期保存，翻譯完成後刪除
- Agora Token 由後端動態產生，不暴露 App Certificate

---

## 各階段技術重點

### Phase 0（目前）
翻譯 pipeline 跑通，延遲達標，本地端 demo

### Phase 1
後端 API、資料庫、WebSocket、React 網頁版、文字翻譯上線

### Phase 2
Agora 視訊整合、語音翻譯接入視訊、React Native App、付費系統

### Phase 3
AI 記憶庫、關係教練、對話摘要、聲音複製

### Phase 4
Auto Scaling、CDN 優化、監控告警、App Store 上架
