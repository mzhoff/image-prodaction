import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { config } from 'dotenv';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { readMigrationFiles } from 'drizzle-orm/migrator';
import { seedLegacyRuntimeUpgrade, verifyLegacyRuntimeUpgrade } from './runtime-v2-upgrade-fixture';

config({ path: '.env.local', quiet: true });
config({ path: '.env', quiet: true });
const baseUrl = new URL(process.env.DATABASE_URL ?? '');
assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(baseUrl.hostname), 'Migration smoke is local-only.');
const adminUrl = new URL(baseUrl); adminUrl.pathname = '/postgres';
const admin = new Pool({ connectionString: adminUrl.href });
const created: string[] = [];
const keep = process.env.RUNTIME_SMOKE_KEEP_DB === 'true';
try {
  for (const phase of ['fresh', 'upgrade'] as const) {
    const name = `image_runtime_v2_${phase}`;
    const existing = await admin.query('SELECT datname FROM pg_database WHERE datname = $1', [name]);
    assert.equal(existing.rowCount, 0, `Refusing to replace an existing database: ${name}`);
    await admin.query(`CREATE DATABASE "${name}"`);
    created.push(name);
    const url = new URL(baseUrl); url.pathname = `/${name}`;
    const pool = new Pool({ connectionString: url.href });
    try {
      const db = drizzle(pool);
      let legacy: Awaited<ReturnType<typeof seedLegacyRuntimeUpgrade>> | undefined;
      if (phase === 'upgrade') {
        const baseline = readMigrationFiles({ migrationsFolder: 'drizzle' }).slice(0, 24);
        assert.equal(baseline.length, 24);
        const connection = await pool.connect();
        try {
          await connection.query('BEGIN');
          await connection.query('CREATE SCHEMA IF NOT EXISTS drizzle');
          await connection.query('CREATE TABLE drizzle.__drizzle_migrations (id SERIAL PRIMARY KEY, hash text NOT NULL, created_at bigint)');
          for (const migration of baseline) {
            for (const statement of migration.sql) if (statement.trim()) await connection.query(statement);
            await connection.query('INSERT INTO drizzle.__drizzle_migrations(hash,created_at) VALUES ($1,$2)', [migration.hash, migration.folderMillis]);
          }
          await connection.query('COMMIT');
        } catch (error) { await connection.query('ROLLBACK'); throw error; }
        finally { connection.release(); }
        legacy = await seedLegacyRuntimeUpgrade(pool);
      }
      await migrate(db, { migrationsFolder: 'drizzle' });
      const result = await pool.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name LIKE 'runtime_%'");
      assert.ok(result.rows.length >= 5);
      if (legacy) await verifyLegacyRuntimeUpgrade(pool, legacy);
      console.log(`PASS ${phase} PostgreSQL migration${legacy ? ': legacy rows, key hashes, runs, artifacts and usage unchanged' : ''}`);
    } finally { await pool.end(); }
    await runScript(phase === 'fresh' ? 'scripts/runtime-v2-persistence-smoke.ts' : 'scripts/runtime-v2-legacy-smoke.ts', {
      ...process.env, DATABASE_URL: url.href, RUNTIME_V2_TEST_DATABASE_URL: url.href,
    });
  }
} finally {
  for (const name of created) {
    if (keep) { console.log(`Retained task-owned test database for browser verification: ${name}`); continue; }
    // Exact names created by this process only; never terminate other sessions.
    await admin.query(`DROP DATABASE "${name}"`);
    console.log(`Removed disposable test database: ${name}`);
  }
  await admin.end();
}

async function runScript(path: string, env: NodeJS.ProcessEnv) {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(process.execPath, ['--experimental-strip-types', '--loader', './scripts/node-test-loader.mjs', path], { env, stdio: 'inherit' });
    child.on('error', reject);
    child.on('exit', (code) => code === 0 ? resolve() : reject(new Error(`${path} failed (${code})`)));
  });
}
