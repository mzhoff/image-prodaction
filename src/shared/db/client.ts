import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

const globalForPostgres = globalThis as typeof globalThis & {
  imageProdactionPool?: Pool;
};

const connectionString = process.env.DATABASE_URL?.trim();

if (!connectionString) {
  throw new Error('DATABASE_URL is required for PostgreSQL.');
}

export const pgPool = globalForPostgres.imageProdactionPool ?? new Pool({
  connectionString,
  max: readPositiveIntegerEnv('DATABASE_POOL_MAX', 10),
  connectionTimeoutMillis: readPositiveIntegerEnv('DATABASE_CONNECT_TIMEOUT_MS', 10_000),
  idleTimeoutMillis: readPositiveIntegerEnv('DATABASE_IDLE_TIMEOUT_MS', 30_000),
});

if (process.env.NODE_ENV !== 'production') {
  globalForPostgres.imageProdactionPool = pgPool;
}

export const db = drizzle(pgPool, { schema });

function readPositiveIntegerEnv(name: string, fallback: number) {
  const parsed = Number.parseInt(process.env[name] ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
