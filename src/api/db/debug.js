// 調試配對查詢
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import pg from 'pg';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '../../../.env') });

const { Pool } = pg;

async function debug() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  const userId = 'a2a51e3b-dbf7-4f95-91c8-42b94cf1fce7'; // taiwan user
  const targetRole = 'vietnam';

  console.log('=== 完整查詢 ===');
  const result = await pool.query(
    `SELECT u.id, u.role,
            p.display_name, p.age, p.location, p.bio,
            p.interests, p.avatar_url, p.is_verified, p.is_online
     FROM users u
     JOIN profiles p ON u.id = p.user_id
     WHERE u.role = $1
       AND u.id NOT IN (
         SELECT user_b FROM matches WHERE user_a = $2
         UNION
         SELECT user_a FROM matches WHERE user_b = $2
       )
     ORDER BY p.is_online DESC, p.is_verified DESC, RANDOM()
     LIMIT 20`,
    [targetRole, userId]
  );
  console.log('結果數量:', result.rows.length);
  console.table(result.rows);

  console.log('\n=== Matches 表 ===');
  const matches = await pool.query('SELECT * FROM matches');
  console.table(matches.rows);

  await pool.end();
}

debug().catch(console.error);
