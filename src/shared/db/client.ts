import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

const globalForPostgres = globalThis as typeof globalThis & {
  imageProdactionDb?: ReturnType<typeof createDatabase>;
  imageProdactionPool?: Pool;
};

export function getDb() {
  globalForPostgres.imageProdactionDb ??= createDatabase(getPostgresPool());
  return globalForPostgres.imageProdactionDb;
}

export function getPostgresPool() {
  globalForPostgres.imageProdactionPool ??= createPool();
  return globalForPostgres.imageProdactionPool;
}

function createPool() {
  const connectionString = process.env.DATABASE_URL?.trim();
  if (!connectionString) throw new Error('DATABASE_URL is required for PostgreSQL.');

  return new Pool({
    connectionString,
    max: readPositiveIntegerEnv('DATABASE_POOL_MAX', 10),
    connectionTimeoutMillis: readPositiveIntegerEnv('DATABASE_CONNECT_TIMEOUT_MS', 10_000),
    idleTimeoutMillis: readPositiveIntegerEnv('DATABASE_IDLE_TIMEOUT_MS', 30_000),
  });
}

function createDatabase(pool: Pool) {
  return drizzle(pool, { schema });
}

function readPositiveIntegerEnv(name: string, fallback: number) {
  const parsed = Number.parseInt(process.env[name] ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
