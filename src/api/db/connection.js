// src/api/db/connection.js
// PostgreSQL 資料庫連線

import pg from 'pg';

const { Pool } = pg;

let pool = null;

/**
 * 初始化資料庫連線池
 */
export function initDb() {
  if (pool) return pool;

  // Neon 需要 SSL 連線
  const isNeon = process.env.DATABASE_URL?.includes('neon.tech');

  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: isNeon ? { rejectUnauthorized: false } : false,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
  });

  pool.on('error', (err) => {
    console.error('[DB] 連線池錯誤:', err.message);
  });

  pool.on('connect', () => {
    console.log('[DB] 新連線建立');
  });

  return pool;
}

/**
 * 取得資料庫連線池
 */
export function getDb() {
  if (!pool) {
    initDb();
  }
  return pool;
}

/**
 * 關閉資料庫連線池
 */
export async function closeDb() {
  if (pool) {
    await pool.end();
    pool = null;
    console.log('[DB] 連線池已關閉');
  }
}
