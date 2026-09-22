import assert from 'node:assert/strict';
import test from 'node:test';
import { createSnapshot } from './s3-backup.mjs';
import { copySource, readStorageConfig } from './s3-ops-config.mjs';

const environment = {
  S3_ENDPOINT: 'https://s3.example.com', S3_REGION: 'ru-1', S3_BUCKET: 'assets',
  S3_ACCESS_KEY_ID: 'access', S3_SECRET_ACCESS_KEY: 'secret',
};

test('S3 ops requires explicit valid external credentials and endpoint', () => {
  const config = readStorageConfig(environment);
  assert.equal(config.clientOptions.forcePathStyle, true);
  for (const key of ['S3_ENDPOINT', 'S3_REGION', 'S3_BUCKET', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY']) {
    assert.throws(() => readStorageConfig({ ...environment, [key]: '' }));
  }
  for (const endpoint of ['http://s3.example.com', 'https://user:secret@s3.example.com',
    'https://s3.example.com/bucket', 'https://s3.example.com?secret=value',
    'https://example.invalid', 'http://localhost:9000']) {
    assert.throws(() => readStorageConfig({ ...environment, S3_ENDPOINT: endpoint }));
  }
  assert.doesNotThrow(() => readStorageConfig({ ...environment, S3_ENDPOINT: 'http://127.0.0.1:9000' }, { allowLocal: true }));
  assert.throws(() => readStorageConfig({ ...environment, S3_FORCE_PATH_STYLE: 'yes' }));
});

test('S3 copy sources preserve unicode, spaces and query characters safely', () => {
  assert.equal(copySource('assets', 'folder/тест #1?.png'), 'assets/folder/%D1%82%D0%B5%D1%81%D1%82%20%231%3F.png');
});

function fixture(pages, failCopy = false) {
  const calls = [];
  const client = { async send(command) {
    const type = command.constructor.name;
    calls.push({ type, input: command.input });
    if (type === 'ListObjectsV2Command') return pages.shift();
    if (type === 'CopyObjectCommand' && failCopy) throw new Error('changed source');
    return {};
  } };
  return { calls, client };
}
const object = { Key: 'workspaces/test/asset.png', ETag: '"original"', Size: 42 };

test('backup paginates, copies conditionally, and publishes completion last', async () => {
  const { calls, client } = fixture([
    { Contents: [object], IsTruncated: true, NextContinuationToken: 'page-2' },
    { Contents: [{ ...object, Key: 'chat-attachments/sealed/test.txt' }], IsTruncated: false },
  ]);
  const manifest = await createSnapshot({ client, bucket: 'assets', backupBucket: 'backups' });
  assert.equal(manifest.objectCount, 2);
  assert.equal(manifest.totalBytes, 84);
  assert.equal(manifest.pages, 2);
  const copies = calls.filter((call) => call.type === 'CopyObjectCommand');
  assert.equal(copies[0].input.CopySourceIfMatch, object.ETag);
  assert.equal(copies[0].input.Bucket, 'backups');
  assert.ok(copies[0].input.Key.endsWith('/objects/' + object.Key));
  assert.equal(calls.filter((call) => call.type === 'ListObjectsV2Command')[1].input.ContinuationToken, 'page-2');
  assert.equal(calls.at(-1).input.Key, `${manifest.prefix}/manifest.json`);
  assert.equal(JSON.parse(calls.at(-1).input.Body).objectCount, 2);
  assert.ok(!calls.some((call) => ['GetObjectCommand', 'DeleteObjectCommand'].includes(call.type)));
});

test('failed copy never publishes a complete manifest or deletes any object', async () => {
  const { calls, client } = fixture([{ Contents: [object] }], true);
  await assert.rejects(createSnapshot({ client, bucket: 'assets', backupBucket: 'backups' }));
  assert.ok(!calls.some((call) => call.type === 'PutObjectCommand'));
  assert.ok(!calls.some((call) => call.type.startsWith('Delete')));
});

test('backup rejects same bucket before making requests', async () => {
  const { calls, client } = fixture([]);
  await assert.rejects(createSnapshot({ client, bucket: 'assets', backupBucket: 'assets' }));
  assert.equal(calls.length, 0);
});

test('backup cannot silently skip oversized objects or malformed pagination', async () => {
  for (const page of [
    { Contents: [{ ...object, Size: 6 * 1024 ** 3 }] },
    { Contents: [{ ...object, ETag: undefined }] },
    { Contents: [], IsTruncated: true },
  ]) {
    const { calls, client } = fixture([page]);
    await assert.rejects(createSnapshot({ client, bucket: 'assets', backupBucket: 'backups' }));
    assert.ok(!calls.some((call) => call.input.Key?.endsWith('/manifest.json')));
  }
});
