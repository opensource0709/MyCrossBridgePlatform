# Phase 2 — 視訊通話 + 即時語音翻譯 + 付費系統

## 目標
1. Agora.io 視訊通話整合
2. 即時雙向語音翻譯接入視訊
3. 付費訂閱整合（開始收費）
4. 虛擬禮物系統
5. React Native App

預計時間：第 3～5 個月
預計費用：40～60 萬 TWD

---

## 開發順序

```
Phase 2-A：Agora.io 視訊通話（第 1～2 週）
        ↓
Phase 2-B：語音翻譯接入視訊（第 3～4 週）
        ↓
Phase 2-C：付費訂閱整合（第 5～6 週）
        ↓
Phase 2-D：虛擬禮物系統（第 7～8 週）
        ↓
Phase 2-E：React Native App（第 9～12 週）
```

---

## Phase 2-A：Agora.io 視訊通話

### 目標
讓台灣端和越南端可以進行面對面視訊通話，不含翻譯，先讓視訊跑通。

### 申請 Agora.io 帳號
1. 去 https://console.agora.io 註冊
2. 建立新專案，選「Secured mode（APP ID + Token）」
3. 取得 APP_ID 和 APP_CERTIFICATE
4. 填入 .env：
```
AGORA_APP_ID=你的APP_ID
AGORA_APP_CERTIFICATE=你的APP_CERTIFICATE
```

### 安裝套件
```bash
# 後端
npm install agora-access-token

# 前端
npm install agora-rtc-sdk-ng
```

### 後端：Token 產生 API

```javascript
// src/api/routes/agora.js
import { RtcTokenBuilder, RtcRole } from 'agora-access-token';

// POST /api/agora/token
// 產生 Agora Token，讓用戶可以加入視訊頻道
router.post('/token', authMiddleware, async (req, res) => {
  const { channelName } = req.body;
  const uid = req.user.id;

  const token = RtcTokenBuilder.buildTokenWithUid(
    process.env.AGORA_APP_ID,
    process.env.AGORA_APP_CERTIFICATE,
    channelName,
    0,                    // uid 0 = 讓 Agora 自動分配
    RtcRole.PUBLISHER,
    Math.floor(Date.now() / 1000) + 3600  // 1 小時後過期
  );

  res.json({ token, channelName, appId: process.env.AGORA_APP_ID });
});
```

### 前端：視訊通話元件

```javascript
// frontend/src/components/VideoCall.jsx
import AgoraRTC from 'agora-rtc-sdk-ng';
import { useState, useEffect, useRef } from 'react';

export default function VideoCall({ matchId, partnerId }) {
  const [client] = useState(() => AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' }));
  const [localVideoTrack, setLocalVideoTrack] = useState(null);
  const [remoteVideoTrack, setRemoteVideoTrack] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);

  const startCall = async () => {
    // 1. 取得 Token
    const { token, channelName, appId } = await api.post('/agora/token', { channelName: matchId });

    // 2. 加入頻道
    await client.join(appId, channelName, token, null);

    // 3. 建立本地視訊和麥克風
    const [audioTrack, videoTrack] = await AgoraRTC.createMicrophoneAndCameraTracks();
    setLocalVideoTrack(videoTrack);

    // 4. 發布到頻道
    await client.publish([audioTrack, videoTrack]);
    setIsConnected(true);

    // 5. 顯示本地視訊
    videoTrack.play(localVideoRef.current);
  };

  // 接收對方的視訊
  useEffect(() => {
    client.on('user-published', async (user, mediaType) => {
      await client.subscribe(user, mediaType);
      if (mediaType === 'video') {
        setRemoteVideoTrack(user.videoTrack);
        user.videoTrack.play(remoteVideoRef.current);
      }
    });
  }, [client]);

  const endCall = async () => {
    localVideoTrack?.close();
    await client.leave();
    setIsConnected(false);
  };

  return (
    <div className="video-call-container">
      {/* 對方的畫面（大畫面） */}
      <div ref={remoteVideoRef} className="remote-video" />

      {/* 自己的畫面（小畫面，右下角） */}
      <div ref={localVideoRef} className="local-video" />

      {/* 控制按鈕 */}
      <div className="controls">
        {!isConnected ? (
          <button onClick={startCall}>開始視訊</button>
        ) : (
          <button onClick={endCall} className="end-call">結束通話</button>
        )}
      </div>
    </div>
  );
}
```

### Phase 2-A 完成標準
- [ ] 台灣端和越南端可以互相視訊
- [ ] 視訊畫面清晰，聲音正常
- [ ] 可以正常結束通話
- [ ] 部署後線上環境測試通過

---

## Phase 2-B：語音翻譯接入視訊

### 目標
視訊通話時，說話自動辨識、翻譯、播出對方語言，畫面顯示雙語字幕。

### 技術流程

```
台灣端說中文
    ↓
Agora 音訊流 → 擷取音訊片段（每 2 秒）
    ↓
WebSocket 傳到後端
    ↓
Whisper STT → 中文文字
    ↓
GPT-4o-mini → 越南文
    ↓
ElevenLabs TTS → 越南文語音
    ↓
透過 Agora 播給越南端
    ↓
同時更新雙語字幕
```

### 後端：語音翻譯 WebSocket

```javascript
// src/api/websocket/voiceTranslation.js
import { WebSocketServer } from 'ws';

export function initVoiceTranslation(server) {
  const wss = new WebSocketServer({ server, path: '/ws/voice' });

  wss.on('connection', (ws, req) => {
    const userId = getUserFromToken(req);
    const direction = req.url.includes('zh') ? 'zh-to-vi' : 'vi-to-zh';

    ws.on('message', async (audioChunk) => {
      try {
        // 1. STT
        const text = await speechToText(audioChunk, direction.split('-to-')[0]);
        if (!text || text.trim() === '') return;

        // 2. 翻譯
        const translated = await translate(text, direction);

        // 3. TTS（串流）
        const audioBuffer = await textToSpeechStream(translated.text, direction.split('-to-')[1]);

        // 4. 回傳給客戶端（原文 + 譯文 + 語音）
        ws.send(JSON.stringify({
          type: 'translation',
          originalText: text,
          translatedText: translated.text,
          audio: audioBuffer.toString('base64'),
        }));

      } catch (error) {
        console.error('[VoiceTranslation] Error:', error);
      }
    });
  });
}
```

### 前端：視訊 + 翻譯整合

```javascript
// frontend/src/components/VideoCallWithTranslation.jsx
export default function VideoCallWithTranslation({ matchId, userRole }) {
  const [subtitles, setSubtitles] = useState({ my: '', partner: '' });
  const [isTranslating, setIsTranslating] = useState(false);
  const wsRef = useRef(null);
  const mediaRecorderRef = useRef(null);

  const startTranslation = async () => {
    // 連接翻譯 WebSocket
    const direction = userRole === 'taiwan' ? 'zh-to-vi' : 'vi-to-zh';
    wsRef.current = new WebSocket(`wss://後端網址/ws/voice?direction=${direction}`);

    // 接收翻譯結果
    wsRef.current.onmessage = (event) => {
      const { originalText, translatedText, audio } = JSON.parse(event.data);

      // 更新字幕
      setSubtitles(prev => ({ ...prev, my: originalText }));

      // 播放翻譯後的語音
      playAudio(audio);
    };

    // 開始錄音並傳送
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaRecorderRef.current = new MediaRecorder(stream);

    mediaRecorderRef.current.ondataavailable = (event) => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(event.data);
      }
    };

    // 每 2 秒傳一次音訊片段
    mediaRecorderRef.current.start(2000);
    setIsTranslating(true);
  };

  return (
    <div className="video-call-container">
      {/* 對方畫面 */}
      <div ref={remoteVideoRef} className="remote-video">
        {/* 對方的字幕（顯示他說的話的翻譯） */}
        <div className="subtitle partner-subtitle">
          {subtitles.partner}
        </div>
      </div>

      {/* 自己畫面 */}
      <div ref={localVideoRef} className="local-video" />

      {/* 自己說話的字幕 */}
      <div className="subtitle my-subtitle">
        {subtitles.my}
      </div>

      {/* AI 延遲指示器 */}
      <div className="latency-indicator">
        AI 翻譯中... 延遲 {latency}ms
      </div>

      {/* 控制按鈕 */}
      <div className="controls">
        <button onClick={isTranslating ? stopTranslation : startTranslation}>
          {isTranslating ? '關閉翻譯' : '開啟翻譯'}
        </button>
        <button onClick={endCall} className="end-call">結束通話</button>
      </div>
    </div>
  );
}
```

### Phase 2-B 完成標準
- [ ] 視訊通話中說話自動翻譯
- [ ] 雙語字幕正常顯示
- [ ] 翻譯後的語音正常播出
- [ ] 感知延遲 < 3 秒（部署到 Railway 新加坡後目標 < 1.5 秒）

---

## Phase 2-C：付費訂閱整合

### 收費方案
| 方案 | 內容 | 定價 |
|------|------|------|
| 免費版 | 每天 3 次配對、文字翻譯（限量） | 免費 |
| 標準版 | 無限文字翻譯、每月 10 小時視訊 | 399 TWD/月 |
| 高級版 | 無限視訊通話、優先配對、AI 記憶庫 | 799 TWD/月 |
| 尊榮版 | 全功能 + 關係教練 AI + 置頂曝光 | 1,499 TWD/月 |

### 金流選擇：綠界科技（ECPay）
台灣最主流的金流服務，支援信用卡、ATM、超商付款。

```bash
npm install ecpay-payment
```

申請：https://www.ecpay.com.tw（需要公司或個人帳號）

### 後端：訂閱 API

```javascript
// src/api/routes/subscription.js

// POST /api/subscription/create
// 建立訂閱付款訂單
router.post('/create', authMiddleware, async (req, res) => {
  const { plan } = req.body;  // standard/premium/vip

  const PLANS = {
    standard: { amount: 399, name: '標準版' },
    premium: { amount: 799, name: '高級版' },
    vip: { amount: 1499, name: '尊榮版' },
  };

  const selectedPlan = PLANS[plan];
  const orderId = `LY_${Date.now()}_${req.user.id}`;

  // 建立綠界付款連結
  const paymentUrl = await createECPayOrder({
    orderId,
    amount: selectedPlan.amount,
    itemName: `LianYue ${selectedPlan.name}月費`,
    returnUrl: `${process.env.BACKEND_URL}/api/subscription/callback`,
  });

  // 存入資料庫（pending 狀態）
  await db.query(
    'INSERT INTO subscriptions (user_id, plan, order_id, status) VALUES ($1, $2, $3, $4)',
    [req.user.id, plan, orderId, 'pending']
  );

  res.json({ paymentUrl });
});

// POST /api/subscription/callback
// 綠界付款完成回調
router.post('/callback', async (req, res) => {
  const { MerchantTradeNo, RtnCode } = req.body;

  if (RtnCode === '1') {  // 付款成功
    await db.query(
      'UPDATE subscriptions SET status = $1 WHERE order_id = $2',
      ['active', MerchantTradeNo]
    );

    // 更新用戶方案
    await db.query(
      'UPDATE users SET subscription_plan = $1 WHERE id = (SELECT user_id FROM subscriptions WHERE order_id = $2)',
      [plan, MerchantTradeNo]
    );
  }

  res.send('1|OK');
});
```

### 資料庫新增

```sql
-- 新增訂閱欄位到 users 表
ALTER TABLE users ADD COLUMN subscription_plan VARCHAR(20) DEFAULT 'free';
ALTER TABLE users ADD COLUMN subscription_expires_at TIMESTAMP;

-- 訂閱記錄表
CREATE TABLE subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  plan VARCHAR(20) NOT NULL,
  order_id VARCHAR(100) UNIQUE NOT NULL,
  status VARCHAR(20) DEFAULT 'pending',
  amount INTEGER NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP
);
```

### Phase 2-C 完成標準
- [ ] 用戶可以選擇方案
- [ ] 付款流程正常
- [ ] 付款成功後自動升級方案
- [ ] 免費版有功能限制（每天 3 次配對）
- [ ] 付費版功能正常解鎖

---

## Phase 2-D：虛擬禮物系統

### 禮物清單
| 禮物 | 價格 | 平台抽成 | 越南端收益 |
|------|------|---------|-----------|
| 珍珠奶茶 | 99 TWD | 30% | 69.3 TWD |
| 玫瑰花 | 199 TWD | 30% | 139.3 TWD |
| 台灣伴手禮 | 499 TWD | 30% | 349.3 TWD |
| 機票（虛擬） | 999 TWD | 30% | 699.3 TWD |

### 後端：送禮 API

```javascript
// POST /api/gifts/send
router.post('/send', authMiddleware, async (req, res) => {
  const { recipientId, giftType, matchId } = req.body;

  const GIFTS = {
    bubble_tea: { price: 99, name: '珍珠奶茶' },
    rose: { price: 199, name: '玫瑰花' },
    souvenir: { price: 499, name: '台灣伴手禮' },
    ticket: { price: 999, name: '機票' },
  };

  const gift = GIFTS[giftType];
  const platformFee = Math.floor(gift.price * 0.3);
  const recipientEarning = gift.price - platformFee;

  // 扣除台灣端點數（或直接付款）
  // 增加越南端待領取金額
  // 記錄送禮記錄

  // 透過 WebSocket 即時通知對方
  notifyUser(recipientId, {
    type: 'gift_received',
    gift: gift.name,
    from: req.user.displayName,
  });

  res.json({ success: true, message: `成功送出 ${gift.name}` });
});
```

### Phase 2-D 完成標準
- [ ] 台灣端可以在視訊中送禮物
- [ ] 越南端即時收到禮物通知
- [ ] 禮物動態效果顯示
- [ ] 越南端可以查看待領取金額

---

## Phase 2-E：React Native App

### 目標
把現有的網頁版轉成 iOS 和 Android App，共用後端 API。

### 初始化

```bash
npx create-expo-app app --template blank
cd app
npm install @react-navigation/native axios socket.io-client
npm install agora-react-native-rtc
```

### 主要頁面（對應網頁版）

```
app/
├── src/
│   ├── screens/
│   │   ├── LoginScreen.jsx      ← 登入頁
│   │   ├── DiscoveryScreen.jsx  ← 配對瀏覽（主頁）
│   │   ├── ChatScreen.jsx       ← 文字聊天翻譯
│   │   ├── VideoCallScreen.jsx  ← 視訊通話翻譯
│   │   ├── ProfileScreen.jsx    ← 個人資料
│   │   └── SubscriptionScreen.jsx ← 付費方案
│   ├── services/
│   │   └── api.js              ← 與網頁版共用邏輯
│   └── components/             ← UI 元件
```

### App 特有功能

推播通知（有人喜歡你/有新訊息）：
```bash
npm install expo-notifications
```

相機直接拍照上傳頭像：
```bash
npm install expo-image-picker
```

### 上架流程

iOS App Store：
- 需要 Apple Developer 帳號（$99 USD/年）
- 需要 Mac 電腦或 CI/CD 服務
- 審核時間約 1～3 天

Google Play：
- 需要 Google Play Console 帳號（$25 USD 一次性）
- 審核時間約 1～3 天

### Phase 2-E 完成標準
- [ ] iOS App 可以正常安裝測試
- [ ] Android App 可以正常安裝測試
- [ ] 所有 Phase 1 功能在 App 上正常運作
- [ ] 視訊通話在手機上正常運作
- [ ] 上架 App Store 和 Google Play

---

## Phase 2 總完成標準

- [ ] 視訊通話跑通
- [ ] 即時語音翻譯接入視訊
- [ ] 付費訂閱可以收款
- [ ] 虛擬禮物系統正常
- [ ] React Native App 上架

---

## Phase 2 完成後更新 CLAUDE.md

記錄以下資訊：
- Phase 2 完成日期
- App Store 和 Google Play 連結
- 付費用戶數量
- 實際測量的語音翻譯延遲
- 進入 Phase 3
