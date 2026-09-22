import { randomUUID } from 'node:crypto';
import {
  S3Client, HeadBucketCommand, ListObjectsV2Command, CopyObjectCommand, PutObjectCommand,
} from '@aws-sdk/client-s3';
import { copySource, isMain, readStorageConfig, reportFailure } from './s3-ops-config.mjs';

const MAX_COPY_BYTES = 5 * 1024 ** 3;

// Caller must pause writers for a consistent DB + media recovery point.
// A unique destination makes retries non-destructive. Only manifest.json means complete.
export async function createSnapshot({ client, bucket, backupBucket }) {
  if (!backupBucket || backupBucket === bucket || backupBucket.startsWith('replace-with-')) {
    throw new Error('A separate S3_BACKUP_BUCKET is required');
  }
  await client.send(new HeadBucketCommand({ Bucket: bucket }));
  await client.send(new HeadBucketCommand({ Bucket: backupBucket }));
  const startedAt = new Date().toISOString();
  const prefix = `snapshots/${startedAt.replaceAll(':', '-')}-${randomUUID()}`;
  let token;
  let objectCount = 0;
  let totalBytes = 0;
  let pages = 0;
  do {
    const page = await client.send(new ListObjectsV2Command({
      Bucket: bucket, ContinuationToken: token, MaxKeys: 500,
    }));
    const entries = [];
    for (const object of page.Contents ?? []) {
      if (!object.Key || !object.ETag || !Number.isSafeInteger(object.Size)
        || object.Size < 0 || object.Size > MAX_COPY_BYTES) {
        throw new Error('Snapshot requires objects with ETag and size at most 5 GiB');
      }
      const backupKey = `${prefix}/objects/${object.Key}`;
      await client.send(new CopyObjectCommand({
        Bucket: backupBucket, Key: backupKey,
        CopySource: copySource(bucket, object.Key), CopySourceIfMatch: object.ETag,
        MetadataDirective: 'COPY',
      }));
      entries.push({ key: object.Key, backupKey, size: object.Size, sourceETag: object.ETag });
      objectCount += 1;
      totalBytes += object.Size;
    }
    pages += 1;
    await client.send(new PutObjectCommand({
      Bucket: backupBucket, Key: `${prefix}/pages/${pages}.json`,
      ContentType: 'application/json', Body: JSON.stringify(entries),
    }));
    const next = page.IsTruncated ? page.NextContinuationToken : undefined;
    if (page.IsTruncated && (!next || next === token)) throw new Error('Invalid S3 pagination');
    token = next;
  } while (token);
  const manifest = {
    version: 1, sourceBucket: bucket, backupBucket, prefix,
    startedAt, completedAt: new Date().toISOString(), objectCount, totalBytes, pages,
    // Checks are server-side copy preconditions; this is not a transactional S3 snapshot.
    consistency: 'writers-must-be-paused',
  };
  await client.send(new PutObjectCommand({
    Bucket: backupBucket, Key: `${prefix}/manifest.json`,
    ContentType: 'application/json', Body: JSON.stringify(manifest),
  }));
  return manifest;
}

if (isMain(import.meta)) {
  let client;
  try {
    if (!process.argv.includes('--write-snapshot')) throw new Error('Pass --write-snapshot explicitly');
    const config = readStorageConfig();
    client = new S3Client(config.clientOptions);
    const manifest = await createSnapshot({
      client, bucket: config.bucket, backupBucket: process.env.S3_BACKUP_BUCKET?.trim(),
    });
    console.log(JSON.stringify(manifest));
  } catch (error) {
    reportFailure('S3 backup (snapshot is incomplete unless manifest.json exists)', error);
  } finally {
    client?.destroy();
  }
}
