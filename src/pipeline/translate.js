// src/pipeline/translate.js
// 翻譯 - 使用 GPT-4o
import OpenAI from 'openai';

// 延遲初始化，避免在 import 時就需要 API Key
let openai = null;
function getOpenAI() {
  if (!openai) {
    openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return openai;
}

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

/**
 * 翻譯文字
 * @param {string} text - 要翻譯的文字
 * @param {string} direction - 翻譯方向 ('zh-to-vi' 或 'vi-to-zh')
 * @returns {Promise<{text: string, elapsed: number}>}
 */
export async function translate(text, direction = 'zh-to-vi') {
  const start = Date.now();

  // 使用環境變數切換模型，預設 gpt-4o-mini 以降低延遲
  const model = process.env.TRANSLATION_MODEL || 'gpt-4o-mini';

  const completion = await getOpenAI().chat.completions.create({
    model: model,
    messages: [
      { role: 'system', content: PROMPTS[direction] },
      { role: 'user', content: text },
    ],
    max_tokens: 300,  // 對話短句不需要太多
    temperature: 0.3,
  });

  const translated = completion.choices[0].message.content.trim();
  const elapsed = Date.now() - start;
  console.log(`[翻譯] 耗時: ${elapsed}ms | ${text} → ${translated}`);

  return {
    text: translated,
    elapsed,
  };
}
