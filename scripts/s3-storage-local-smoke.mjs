// Uses only temporary buckets on the EXISTING local MinIO; never starts containers.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import {
  S3Client, CreateBucketCommand, DeleteBucketCommand, ListObjectsV2Command,
  DeleteObjectCommand, PutObjectCommand, GetObjectCommand, CopyObjectCommand,
} from '@aws-sdk/client-s3';
import { copySource, readStorageConfig, reportFailure } from './s3-ops-config.mjs';
import { probeStorage } from './s3-storage-smoke.mjs';
import { createSnapshot } from './s3-backup.mjs';

const buckets = [];
let client;
try {
  if (!process.argv.includes('--local-only')) throw new Error('Pass --local-only');
  const source = `reverie-ops-test-${randomUUID()}`;
  const backup = `reverie-ops-test-${randomUUID()}`;
  const config = readStorageConfig({ ...process.env, S3_BUCKET: source }, { allowLocal: true });
  const endpoint = new URL(config.clientOptions.endpoint);
  assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(endpoint.hostname), 'Local integration only');
  client = new S3Client(config.clientOptions);
  for (const Bucket of [source, backup]) {
    await client.send(new CreateBucketCommand({ Bucket }));
    buckets.push(Bucket);
  }
  // MinIO has its own CORS behavior; Timeweb CORS needs a separate remote smoke check.
  await probeStorage(config);
  const data = Buffer.from('Fixture: stored image/video/audio bytes use the same S3 contract');
  const Key = 'workspaces/probe/documents/probe/assets/test.dat';
  await client.send(new PutObjectCommand({ Bucket: source, Key, Body: data, ContentType: 'application/octet-stream' }));
  const manifest = await createSnapshot({ client, bucket: source, backupBucket: backup });
  assert.equal(manifest.objectCount, 1, 'Upload probe must leave no objects');
  const completed = await client.send(new GetObjectCommand({ Bucket: backup, Key: `${manifest.prefix}/manifest.json` }));
  assert.equal(JSON.parse(await completed.Body.transformToString()).totalBytes, data.length);
  const page = await client.send(new GetObjectCommand({ Bucket: backup, Key: `${manifest.prefix}/pages/1.json` }));
  const [entry] = JSON.parse(await page.Body.transformToString());
  assert.equal(entry.key, Key);
  // Actual restore copy from snapshot to a new task-owned location, followed by byte comparison.
  await client.send(new CopyObjectCommand({
    Bucket: source, Key: 'restored/test.dat', CopySource: copySource(backup, entry.backupKey),
  }));
  const restored = await client.send(new GetObjectCommand({ Bucket: source, Key: 'restored/test.dat' }));
  assert.deepEqual(Buffer.from(await restored.Body.transformToByteArray()), data);
  console.log('Local S3 passed: private objects, bytes/range, signed upload/read, attachment sealing, backup and restore.');
} catch (error) {
  reportFailure('Local S3 integration', error);
} finally {
  let cleanupFailed = false;
  for (const Bucket of buckets) {
    try {
      // Only buckets successfully created above; no user bucket is ever listed/deleted.
      const objects = await client.send(new ListObjectsV2Command({ Bucket }));
      assert.ok(!objects.IsTruncated, 'Fixture unexpectedly large; leave for inspection');
      for (const object of objects.Contents ?? []) {
        await client.send(new DeleteObjectCommand({ Bucket, Key: object.Key }));
      }
      await client.send(new DeleteBucketCommand({ Bucket }));
    } catch (error) {
      console.error(`Fixture cleanup failed for ${Bucket}`);
      reportFailure('Local S3 cleanup', error);
      cleanupFailed = true;
    }
  }
  client?.destroy();
  if (buckets.length && !cleanupFailed) console.log('All temporary buckets and probe files removed.');
}
