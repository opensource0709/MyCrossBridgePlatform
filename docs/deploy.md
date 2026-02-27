# 上線部署指南

## 架構概覽

```
用戶瀏覽器
    ↓
Vercel（前端 React）
    ↓ API 請求
Railway（後端 Node.js）
    ↓
Neon PostgreSQL（新加坡）
```

---

## 部署順序

```
第一步：部署後端到 Railway
第二步：部署前端到 Vercel
第三步：連結前後端網址
第四步：測試上線環境
```

---

## 第一步：Railway 後端部署

### 申請 Railway 帳號
去 https://railway.app，用 GitHub 登入

### 準備 package.json
確認 `src/api/package.json` 有以下設定：
```json
{
  "scripts": {
    "start": "node server.js",
    "dev": "nodemon server.js"
  },
  "engines": {
    "node": ">=20.0.0"
  }
}
```

### 確認 server.js 監聽 PORT 環境變數
```javascript
// server.js 最底部要有這個
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
```

### 部署步驟
1. 去 https://railway.app/new
2. 選「Deploy from GitHub repo」
3. 連結你的 GitHub 帳號
4. 先把專案推上 GitHub（如果還沒有）
5. 選擇你的 repo
6. 設定 Root Directory 為 `src/api`

### 設定環境變數
在 Railway 專案的 Variables 頁面，加入以下所有變數：

```
NODE_ENV=production
PORT=3000

# OpenAI
OPENAI_API_KEY=你的key

# ElevenLabs
ELEVENLABS_API_KEY=你的key

# Deepgram
DEEPGRAM_API_KEY=你的key

# 翻譯模型
TRANSLATION_MODEL=gpt-4o-mini

# Neon 資料庫（從 Neon 後台複製）
DATABASE_URL=postgresql://neondb_owner:xxxx@ep-xxx.ap-southeast-1.aws.neon.tech/neondb?sslmode=require

# JWT
JWT_SECRET=產生一個隨機字串（至少32字元）
JWT_REFRESH_SECRET=產生另一個隨機字串

# 前端網址（Vercel 部署完後填入）
FRONTEND_URL=https://你的專案名稱.vercel.app

# Agora（Phase 2 才需要，先留空）
AGORA_APP_ID=
AGORA_APP_CERTIFICATE=
```

### 產生 JWT Secret 的方法
在終端機執行：
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```
執行兩次，分別填入 JWT_SECRET 和 JWT_REFRESH_SECRET

### 部署完成後
Railway 會給你一個網址，格式像：
```
https://lianyue-backend.up.railway.app
```
記下這個網址，第二步會用到。

---

## 第二步：Vercel 前端部署

### 申請 Vercel 帳號
去 https://vercel.com，用 GitHub 登入

### 確認前端 API 網址設定
在 `frontend/` 資料夾，確認 API 請求網址是透過環境變數控制：

```javascript
// frontend/src/services/api.js
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';
```

### 部署步驟
1. 去 https://vercel.com/new
2. Import Git Repository
3. 選擇你的 repo
4. 設定：
   - Framework Preset：Vite
   - Root Directory：`frontend`
   - Build Command：`npm run build`
   - Output Directory：`dist`

### 設定環境變數
在 Vercel 專案的 Environment Variables 頁面加入：

```
VITE_API_URL=https://你的railway網址.up.railway.app
```

### 部署完成後
Vercel 會給你一個網址，格式像：
```
https://lianyue.vercel.app
```

---

## 第三步：連結前後端

### 更新 Railway 的 FRONTEND_URL
回到 Railway，把 FRONTEND_URL 更新為 Vercel 的網址：
```
FRONTEND_URL=https://lianyue.vercel.app
```

更新後 Railway 會自動重新部署。

### 確認 CORS 設定
後端 `server.js` 的 CORS 設定要允許 Vercel 網址：
```javascript
app.use(cors({
  origin: process.env.FRONTEND_URL,
  credentials: true,
}));
```

---

## 第四步：上線測試清單

部署完成後，依序測試以下功能：

```
基本連線
- [ ] 前端網址可以正常開啟
- [ ] 後端 /health 端點回應正常

用戶功能
- [ ] 台灣端可以註冊
- [ ] 越南端可以註冊
- [ ] 登入後可以進入主頁面

聊天功能
- [ ] 兩個帳號可以配對
- [ ] 可以發送訊息
- [ ] AI 翻譯正常運作
- [ ] WebSocket 即時更新正常

個人資料
- [ ] 可以上傳頭像
- [ ] 可以填寫個人資料
```

---

## 推上 GitHub（如果還沒有）

```bash
# 在專案根目錄執行
git init
git add .
git commit -m "Initial commit - Phase 1 MVP"

# 去 github.com 建立新的 repo，然後：
git remote add origin https://github.com/你的帳號/lianyue.git
git push -u origin main
```

確認 .gitignore 有排除以下檔案：
```
.env
node_modules/
output/
*.mp3
*.wav
dist/
```

---

## 部署完成後更新 CLAUDE.md

部署成功後，請更新 CLAUDE.md 記錄：
- 前端網址（Vercel）
- 後端網址（Railway）
- 部署日期
- Phase 1 正式完成

---

## 常見問題

**Railway 部署失敗**
- 確認 package.json 有 start script
- 確認所有環境變數都填了
- 查看 Railway 的 Deploy Logs

**前端打不到後端 API**
- 確認 VITE_API_URL 設定正確
- 確認後端 CORS 允許 Vercel 網址
- 確認 Railway 後端正常運作

**資料庫連線失敗**
- 確認 DATABASE_URL 是完整的 Neon 連線字串
- 確認字串末尾有 `?sslmode=require`

**WebSocket 連線失敗**
- Railway 支援 WebSocket，不需要額外設定
- 確認前端 WebSocket 連線網址用的是 `wss://`（不是 `ws://`）
