// 檢查資料庫資料
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import pg from 'pg';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '../../../.env') });

const { Pool } = pg;

async function check() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  console.log('=== Users ===');
  const users = await pool.query('SELECT id, email, role FROM users');
  console.table(users.rows);

  console.log('\n=== Profiles ===');
  const profiles = await pool.query('SELECT user_id, display_name, is_online FROM profiles');
  console.table(profiles.rows);

  console.log('\n=== Query Test (taiwan user looking for vietnam) ===');
  const test = await pool.query(`
    SELECT u.id, u.role, p.display_name
    FROM users u
    JOIN profiles p ON u.id = p.user_id
    WHERE u.role = 'vietnam'
  `);
  console.table(test.rows);

  await pool.end();
}

check().catch(console.error);
