import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import {
  CreateBucketCommand, DeleteBucketCommand, DeleteObjectsCommand,
  ListObjectsV2Command, S3Client,
} from '@aws-sdk/client-s3';
import { Pool } from 'pg';

/** A separate database prevents running application workers from claiming smoke jobs. */
export async function isolatePersistenceSmoke(scriptUrl: string): Promise<boolean> {
  if (process.env.SMOKE_ISOLATED_SCRIPT === scriptUrl) return false;
  const database = new URL(process.env.DATABASE_URL ?? '');
  const endpoint = new URL(process.env.S3_ENDPOINT ?? '');
  for (const target of [database, endpoint]) {
    assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(target.hostname),
      'Persistence smoke only creates fixtures in loopback PostgreSQL and S3.');
  }
  const suffix = randomBytes(8).toString('hex');
  const databaseName = `reverie_smoke_${suffix}`;
  const bucketName = `reverie-smoke-${suffix}`;
  const adminUrl = new URL(database);
  adminUrl.pathname = '/postgres';
  const admin = new Pool({ connectionString: adminUrl.toString() });
  assert.ok(process.env.S3_ACCESS_KEY_ID && process.env.S3_SECRET_ACCESS_KEY,
    'Local S3 credentials are required for smoke fixtures.');
  const storage = new S3Client({
    endpoint: endpoint.toString(), region: process.env.S3_REGION ?? 'us-east-1',
    forcePathStyle: true,
    credentials: { accessKeyId: process.env.S3_ACCESS_KEY_ID, secretAccessKey: process.env.S3_SECRET_ACCESS_KEY },
  });
  let databaseCreated = false;
  let bucketCreated = false;
  try {
    await admin.query(`CREATE DATABASE "${databaseName}"`);
    databaseCreated = true;
    await storage.send(new CreateBucketCommand({ Bucket: bucketName }));
    bucketCreated = true;
    database.pathname = `/${databaseName}`;
    const env = {
      ...process.env, DATABASE_URL: database.toString(), S3_BUCKET: bucketName,
      S3_ENDPOINT: endpoint.toString(), S3_FORCE_PATH_STYLE: 'true',
      SMOKE_ISOLATED_SCRIPT: scriptUrl, CI: 'true', AI_PROVIDER_RUNTIME: 'fake',
      FAKE_AI_PROVIDER_CREDENTIAL: 'fake-valid-credential',
      PROVIDER_CREDENTIALS_MASTER_KEY: randomBytes(32).toString('base64'),
      PROVIDER_CREDENTIALS_FINGERPRINT_KEY: randomBytes(32).toString('base64'),
      CHAT_TOOL_APPROVAL_SECRET: randomBytes(32).toString('base64'),
    };
    await run('npm', ['run', 'db:migrate'], env);
    await run(process.execPath, ['--experimental-strip-types', '--loader',
      './scripts/node-test-loader.mjs', fileURLToPath(scriptUrl)], env);
  } finally {
    try {
      if (bucketCreated) {
        // Only the uniquely named bucket created above is eligible for cleanup.
        for (;;) {
          const page = await storage.send(new ListObjectsV2Command({ Bucket: bucketName }));
          const objects = (page.Contents ?? []).flatMap((object) => object.Key ? [{ Key: object.Key }] : []);
          if (!objects.length) break;
          const deleted = await storage.send(new DeleteObjectsCommand({
            Bucket: bucketName, Delete: { Objects: objects, Quiet: true },
          }));
          assert.equal(deleted.Errors?.length ?? 0, 0, 'Smoke object cleanup failed.');
        }
        await storage.send(new DeleteBucketCommand({ Bucket: bucketName }));
      }
    } finally {
      storage.destroy();
      try {
        if (databaseCreated) await admin.query(`DROP DATABASE "${databaseName}" WITH (FORCE)`);
      } finally { await admin.end(); }
    }
  }
  console.log('Isolated persistence smoke database and bucket removed.');
  return true;
}

async function run(command: string, args: string[], env: NodeJS.ProcessEnv) {
  const child = spawn(command, args, { env, stdio: 'inherit' });
  const code = await new Promise<number>((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (status) => resolve(status ?? 1));
  });
  assert.equal(code, 0, `Smoke subprocess failed: ${command} ${args.join(' ')}`);
}
