import { Pool } from 'pg';

const state = globalThis as typeof globalThis & { imageProductionCoordinationPool?: Pool };

/** Long-lived advisory locks must not consume the pool needed for auth, saves and job progress. */
export function getCoordinationPool() {
  if (!state.imageProductionCoordinationPool) {
    const connectionString = process.env.DATABASE_URL?.trim();
    if (!connectionString) throw new Error('DATABASE_URL is required for PostgreSQL.');
    const pool = new Pool({ connectionString, max: 4, connectionTimeoutMillis: 2_000,
      idleTimeoutMillis: 30_000, allowExitOnIdle: true });
    pool.on('error', () => console.error('database_coordination_connection_lost'));
    state.imageProductionCoordinationPool = pool;
  }
  return state.imageProductionCoordinationPool;
}
