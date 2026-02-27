// src/pipeline/test.js
// Pipeline 測試程式
import 'dotenv/config';
import { runPipeline } from './pipeline.js';
import fs from 'fs';

// 確保 output 資料夾存在
if (!fs.existsSync('output')) {
  fs.mkdirSync('output', { recursive: true });
}

// 檢查 test-audio 資料夾
if (!fs.existsSync('test-audio')) {
  console.log('⚠️  test-audio/ 資料夾不存在');
  console.log('請建立 test-audio/ 資料夾並放入測試音檔：');
  console.log('  - test-audio/chinese_test.mp3 （中文語音）');
  console.log('  - test-audio/vietnamese_test.mp3 （越南語語音）');
  console.log('\n可以用以下方式產生測試音檔：');
  console.log('  Windows: 使用線上 TTS 工具');
  console.log('  macOS: say -v Mei-Jia "你好" -o chinese_test.aiff && ffmpeg -i chinese_test.aiff chinese_test.mp3');
  process.exit(1);
}

// 檢查環境變數
if (!process.env.OPENAI_API_KEY) {
  console.error('❌ 缺少 OPENAI_API_KEY 環境變數');
  console.error('請在 .env 檔案中設定你的 API Key');
  process.exit(1);
}

if (!process.env.ELEVENLABS_API_KEY) {
  console.error('❌ 缺少 ELEVENLABS_API_KEY 環境變數');
  console.error('請在 .env 檔案中設定你的 API Key');
  process.exit(1);
}

// 取得命令列參數決定測試模式
const testMode = process.argv[2] || 'all';

async function runTests() {
  console.log('🚀 開始 Pipeline 測試\n');

  const results = [];

  // 測試 1：中文 → 越南文
  if (testMode === 'all' || testMode === 'zh') {
    const zhTestFile = 'test-audio/chinese_test.mp3';
    if (fs.existsSync(zhTestFile)) {
      console.log('\n【測試 1】中文 → 越南文');
      console.log('─'.repeat(40));
      try {
        const result = await runPipeline(zhTestFile, 'zh-to-vi');
        results.push({ test: 'zh-to-vi', success: true, ...result });
      } catch (error) {
        console.error('❌ 測試失敗:', error.message);
        results.push({ test: 'zh-to-vi', success: false, error: error.message });
      }
    } else {
      console.log(`⚠️  跳過中文測試：找不到 ${zhTestFile}`);
    }
  }

  // 測試 2：越南文 → 中文
  if (testMode === 'all' || testMode === 'vi') {
    const viTestFile = 'test-audio/vietnamese_test.mp3';
    if (fs.existsSync(viTestFile)) {
      console.log('\n【測試 2】越南文 → 中文');
      console.log('─'.repeat(40));
      try {
        const result = await runPipeline(viTestFile, 'vi-to-zh');
        results.push({ test: 'vi-to-zh', success: true, ...result });
      } catch (error) {
        console.error('❌ 測試失敗:', error.message);
        results.push({ test: 'vi-to-zh', success: false, error: error.message });
      }
    } else {
      console.log(`⚠️  跳過越南文測試：找不到 ${viTestFile}`);
    }
  }

  // 總結報告
  console.log('\n' + '═'.repeat(50));
  console.log('📊 測試總結');
  console.log('═'.repeat(50));

  for (const r of results) {
    if (r.success) {
      const status = r.latency.total < 1500 ? '✅' : '⚠️';
      console.log(`${status} ${r.test}: ${r.latency.total}ms`);
    } else {
      console.log(`❌ ${r.test}: 失敗 - ${r.error}`);
    }
  }

  // 儲存測試結果
  const reportPath = `output/test_report_${Date.now()}.json`;
  fs.writeFileSync(reportPath, JSON.stringify(results, null, 2));
  console.log(`\n📄 測試報告已儲存: ${reportPath}`);
}

runTests().catch(console.error);
