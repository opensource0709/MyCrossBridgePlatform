# API 規格文件

## 1. OpenAI Whisper — 語音辨識 (STT)

### 基本資訊
- 文件：https://platform.openai.com/docs/api-reference/audio
- 計費：$0.006 USD / 分鐘
- 模型：`whisper-1`

### 支援語言
- 中文：`language: 'zh'`
- 越南文：`language: 'vi'`
- 不指定語言也可以（自動偵測），但指定語言更快更準

### 支援音檔格式
mp3, mp4, mpeg, mpga, m4a, wav, webm
單檔最大 25MB

### 使用範例
```javascript
const transcription = await openai.audio.transcriptions.create({
  file: fs.createReadStream(audioFilePath),
  model: 'whisper-1',
  language: 'zh',         // 或 'vi'
  response_format: 'text' // 只要純文字
});
```

### 注意事項
- 音檔太短（< 0.5 秒）可能辨識失敗
- 越南文有口音差異（南越/北越），目前 Whisper 都能處理
- 背景噪音大時辨識率會下降，未來可考慮前端降噪

### 延遲參考
- 一般 5～15 秒語音：約 200～400ms
- 目標控制在 300ms 以內

---

## 2. OpenAI GPT-4o — 翻譯

### 基本資訊
- 文件：https://platform.openai.com/docs/api-reference/chat
- 計費：input $2.5 / 1M tokens，output $10 / 1M tokens
- 模型：`gpt-4o`（品質最好）、`gpt-4o-mini`（速度快、便宜，可備用）

### 翻譯 Prompt 設計原則
- system prompt 要強調「自然對話語氣」，不要書面翻譯
- 加入「只輸出譯文」避免模型附加解釋
- temperature 設 0.3，翻譯要準確不要太有創意

### 使用範例
```javascript
const completion = await openai.chat.completions.create({
  model: 'gpt-4o',
  messages: [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: sourceText }
  ],
  temperature: 0.3,
  max_tokens: 500,  // 對話句子不會太長，限制加速回應
});
```

### Prompt 範本

**中文 → 越南文**
```
你是一個專業的中文到越南文翻譯。
請將用戶輸入的中文翻譯成自然流暢的越南文。
語氣要友善、自然，像朋友之間的對話。
只輸出譯文，不要加任何解釋或備注。
```

**越南文 → 中文**
```
Bạn là một dịch giả chuyên nghiệp từ tiếng Việt sang tiếng Trung.
Hãy dịch văn bản tiếng Việt của người dùng sang tiếng Trung tự nhiên.
Giọng điệu thân thiện, tự nhiên như cuộc trò chuyện giữa bạn bè.
Chỉ xuất bản dịch, không thêm giải thích.
```

### 情感語氣潤色（Phase 2 功能）
未來可在 prompt 加入親密度參數：
```
目前關係階段：[初識/熟識/親密]
請根據關係階段調整翻譯的語氣與用詞。
```

### 注意事項
- 越南文有南北腔差異，prompt 可加「使用南越口語」指定
- 對話內容簡短，max_tokens 500 就夠，可以加速回應
- 如果延遲超標，可臨時換 gpt-4o-mini 測試速度差異

### 延遲參考
- 短句（10～30字）：約 300～600ms
- 目標控制在 500ms 以內

---

## 3. ElevenLabs — 語音合成 (TTS)

### 基本資訊
- 文件：https://elevenlabs.io/docs/api-reference
- 計費：免費版 10,000 字/月；Starter $5/月 30,000 字
- 套件：`npm install elevenlabs`

### 關鍵模型
- `eleven_multilingual_v2`：支援越南文，**必須使用這個**
- `eleven_monolingual_v1`：只支援英文，不要用

### Voice ID 選擇
去 ElevenLabs 後台 Voice Library 搜尋：
- 越南女聲：搜尋 "Vietnamese female" 或 "Vietnamese girl"
- 中文男聲：搜尋 "Chinese male" 或 "Mandarin"

```javascript
const VOICE_IDS = {
  vi_female: '待填入',  // 去後台選越南女聲後填入
  zh_male: '待填入',    // 去後台選中文男聲後填入
};
```

### 使用範例（Streaming 模式，延遲最低）
```javascript
const audioStream = await client.generate({
  voice: VOICE_IDS.vi_female,
  text: translatedText,
  model_id: 'eleven_multilingual_v2',
  stream: true,
});
```

### 注意事項
- **一定要用 eleven_multilingual_v2**，其他模型不支援越南文
- Voice Cloning（聲音複製）是 Phase 3 功能，Phase 0 先用預設音色
- 免費額度每月 10,000 字，Phase 0 測試夠用
- Streaming 模式可以邊生成邊播放，延遲比等整段生成低很多

### 延遲參考
- 非 streaming：約 500～1000ms
- streaming（開始播放時間）：約 200～400ms
- 目標控制在 300ms 以內（使用 streaming）

---

## 4. Agora.io — 視訊通話

### 基本資訊
- 文件：https://docs.agora.io
- 計費：前 10,000 分鐘/月免費；之後約 $1.99 USD / 1000 分鐘
- SDK：React Native 版 `agora-react-native-rtc`、Web 版 `agora-rtc-sdk-ng`

> **Phase 0 不需要整合 Agora，Phase 2 才開始**

### Phase 2 整合重點
```javascript
// 初始化
const client = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' });

// 加入頻道
await client.join(APP_ID, channelName, token, uid);

// 發布本地串流
const localTrack = await AgoraRTC.createMicrophoneAndCameraTrack();
await client.publish(localTrack);
```

### Token 安全機制
- 開發階段可用 App ID 直接連線（不安全）
- 上線前必須實作後端 Token Server 產生動態 Token
- Token 有效期建議設 1 小時

### 延遲參考
- 台灣 ↔ 越南：約 30～80ms（Agora 在兩地都有節點）

---

## API 月費估算

| 服務 | Phase 0（測試） | Phase 1（低流量） | Phase 2（成長期） |
|------|---------------|-----------------|-----------------|
| OpenAI Whisper + GPT-4o | < 500 TWD | ~10,000 TWD | ~50,000 TWD |
| ElevenLabs | 免費額度 | ~2,000 TWD | ~10,000 TWD |
| Agora.io | 不需要 | 不需要 | ~5,000 TWD |
| AWS | 不需要 | ~5,000 TWD | ~20,000 TWD |
| **合計** | **< 500 TWD** | **~17,000 TWD** | **~85,000 TWD** |

---

## 備援方案

| 主要服務 | 備援方案 | 切換條件 |
|---------|---------|---------|
| OpenAI Whisper | 本地端 Whisper（open source） | API 中斷或漲價 |
| GPT-4o | GPT-4o-mini / Claude API | 成本過高 |
| ElevenLabs | Google TTS / Azure TTS | API 中斷 |
| Agora.io | Daily.co / Twilio Video | 服務中斷 |
