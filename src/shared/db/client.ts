import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

const globalForPostgres = globalThis as typeof globalThis & {
  imageProdactionPool?: Pool;
};

const connectionString = process.env.DATABASE_URL?.trim();

if (!connectionString) {
  throw new Error('DATABASE_URL is required for PostgreSQL auth storage.');
}

export const pgPool =
  globalForPostgres.imageProdactionPool ??
  new Pool({
    connectionString,
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPostgres.imageProdactionPool = pgPool;
}

export const db = drizzle(pgPool, { schema });
