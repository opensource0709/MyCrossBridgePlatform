// src/api/db/init.js
// 初始化資料庫結構
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';
import pg from 'pg';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 載入 .env
dotenv.config({ path: join(__dirname, '../../../.env') });

const { Pool } = pg;

async function initDatabase() {
  console.log('🔌 連接資料庫...');

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  try {
    // 測試連接
    const client = await pool.connect();
    console.log('✅ 資料庫連接成功！');

    // 讀取並執行 schema.sql
    const schemaPath = join(__dirname, 'schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf8');

    console.log('📝 建立資料表...');
    await client.query(schema);
    console.log('✅ 資料表建立完成！');

    // 顯示已建立的表
    const tables = await client.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name
    `);

    console.log('\n📊 已建立的資料表：');
    tables.rows.forEach(row => {
      console.log(`   - ${row.table_name}`);
    });

    client.release();
    await pool.end();

    console.log('\n🎉 資料庫初始化完成！');
  } catch (err) {
    console.error('❌ 錯誤:', err.message);
    process.exit(1);
  }
}

initDatabase();
