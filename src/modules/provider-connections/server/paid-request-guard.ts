import { createHash } from 'node:crypto';
import { getPostgresPool } from '@/shared/db/client';
import { ProviderAdapterError } from '../core/provider-errors';
import { descriptor } from '../core/provider-error-descriptors';

/** Across web/worker processes: one synchronous paid request for the same child key. */
export async function withPaidCredential<T>(credential: string, run: () => Promise<T>) {
  if (process.env.PLATFORM_PAID_REQUEST_GUARD !== 'true') return run();
  const binding = `paid:${createHash('sha256').update(credential).digest('hex')}`;
  const db = await getPostgresPool().connect();
  let locked = false;
  try {
    locked = (await db.query('SELECT pg_try_advisory_lock(hashtextextended($1,0)) AS locked', [binding])).rows[0].locked;
    if (!locked) throw new ProviderAdapterError(descriptor('rate_limited', 'retryable', {
      httpStatus: 429, retryAfterMs: 2_000, message: 'В этом AI-бюджете уже выполняется запрос. Дождитесь результата и повторите.',
    }));
    return await run();
  } finally {
    let reusable = true;
    if (locked) await db.query('SELECT pg_advisory_unlock(hashtextextended($1,0))', [binding]).catch(() => { reusable = false; });
    db.release(!reusable);
  }
}
