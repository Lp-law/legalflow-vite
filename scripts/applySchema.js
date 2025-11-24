import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pkg from 'pg';
import 'dotenv/config';

const { Pool } = pkg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const schemaPath = path.join(__dirname, '..', 'schema.sql');
const sql = readFileSync(schemaPath, 'utf8');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function main() {
  const client = await pool.connect();
  try {
    await client.query(sql);
    console.log('Schema applied successfully');
  } catch (err) {
    console.error('Failed to apply schema:', err);
  } finally {
    client.release();
    pool.end();
  }
}

main();