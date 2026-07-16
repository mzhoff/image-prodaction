import { sql } from 'drizzle-orm';
import { getDb } from '@/shared/db/client';

export const runtime = 'nodejs';

export async function GET() {
  try {
    await getDb().execute(sql`select 1`);
    return Response.json({ status: 'ready', checks: { database: 'ok' } });
  } catch (error) {
    console.error('Readiness check failed', error);
    return Response.json({ status: 'not_ready', checks: { database: 'failed' } }, { status: 503 });
  }
}
