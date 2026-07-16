import { sql } from 'drizzle-orm';
import { getDb } from '@/shared/db/client';
import { getAssetObjectStore } from '@/shared/storage/s3-assets';

export interface ReadinessDependencies {
  checkDatabase(): Promise<void>;
  checkObjectStorage(): Promise<void>;
}

export async function getReadiness(
  dependencies: ReadinessDependencies = createReadinessDependencies(),
) {
  const [database, objectStorage] = await Promise.allSettled([
    dependencies.checkDatabase(),
    dependencies.checkObjectStorage(),
  ]);
  const checks = {
    database: database.status === 'fulfilled' ? 'ok' : 'failed',
    objectStorage: objectStorage.status === 'fulfilled' ? 'ok' : 'failed',
  } as const;
  const ready = database.status === 'fulfilled' && objectStorage.status === 'fulfilled';

  if (!ready) {
    logFailedCheck('database', database);
    logFailedCheck('object-storage', objectStorage);
  }

  return Response.json({
    status: ready ? 'ready' : 'not_ready',
    checks,
  }, { status: ready ? 200 : 503 });
}

function createReadinessDependencies(): ReadinessDependencies {
  return {
    async checkDatabase() {
      await getDb().execute(sql`select 1`);
    },
    async checkObjectStorage() {
      await getAssetObjectStore().health();
    },
  };
}

function logFailedCheck(name: string, result: PromiseSettledResult<void>) {
  if (result.status === 'fulfilled') return;
  console.error('Readiness dependency failed', {
    dependency: name,
    errorName: result.reason instanceof Error ? result.reason.name : 'UnknownError',
  });
}
