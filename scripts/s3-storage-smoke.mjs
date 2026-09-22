import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import {
  S3Client, HeadBucketCommand, PutObjectCommand, GetObjectCommand, DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { S3AttachmentObjectStorage } from '@prodactionpro/chat-attachments-s3';
import { isMain, readStorageConfig, reportFailure } from './s3-ops-config.mjs';

const fetchProbe = (url, options = {}) => fetch(url, {
  ...options, redirect: 'error', signal: AbortSignal.timeout(30_000),
});

export async function probeStorage(config, { origin } = {}) {
  const client = new S3Client(config.clientOptions);
  const prefix = `_ops/s3-probe/${randomUUID()}`;
  const key = `${prefix}/asset.txt`;
  const payload = Buffer.from('Reverie S3 compatibility probe — temporary data');
  const sha256 = createHash('sha256').update(payload).digest('hex');
  const attachments = new S3AttachmentObjectStorage({
    ...config.clientOptions, ...config.clientOptions.credentials,
    bucket: config.bucket, keyPrefix: `${prefix}/attachments`,
  });
  const cleanup = new Set([key]);
  let failure;
  let stage = 'bucket access';
  try {
    await client.send(new HeadBucketCommand({ Bucket: config.bucket }));
    stage = 'asset write/read and range';
    await client.send(new PutObjectCommand({
      Bucket: config.bucket, Key: key, Body: payload, ContentType: 'text/plain',
    }));
    const stored = await client.send(new GetObjectCommand({ Bucket: config.bucket, Key: key }));
    assert.deepEqual(Buffer.from(await stored.Body.transformToByteArray()), payload);
    const range = await client.send(new GetObjectCommand({ Bucket: config.bucket, Key: key, Range: 'bytes=0-6' }));
    assert.deepEqual(Buffer.from(await range.Body.transformToByteArray()), payload.subarray(0, 7));
    // Test a known existing object, not an absent staging object.
    const publicAsset = new URL(config.clientOptions.endpoint);
    if (config.clientOptions.forcePathStyle) publicAsset.pathname = `/${config.bucket}/${key}`;
    else { publicAsset.hostname = `${config.bucket}.${publicAsset.hostname}`; publicAsset.pathname = `/${key}`; }
    const publicRead = await fetchProbe(publicAsset);
    await publicRead.body?.cancel();
    assert.ok([401, 403].includes(publicRead.status), 'Bucket must reject anonymous reads');

    stage = 'signed upload target';
    const id = randomUUID();
    const target = await attachments.createUploadTarget({
      attachmentId: id, name: 'probe.txt', contentType: 'text/plain',
      checksumSha256: sha256, productId: 'storage-probe', userId: 'storage-probe',
    });
    cleanup.add(target.storageRef);
    if (origin) {
      stage = 'browser CORS';
      assert.equal(new URL(origin).origin, origin, 'Origin must be an origin without trailing slash');
      const preflight = await fetchProbe(target.upload.url, { method: 'OPTIONS', headers: {
        Origin: origin, 'Access-Control-Request-Method': 'PUT',
        'Access-Control-Request-Headers': 'content-type,x-amz-checksum-sha256',
      } });
      await preflight.body?.cancel();
      assert.ok(preflight.ok, 'CORS preflight failed');
      assert.equal(preflight.headers.get('access-control-allow-origin'), origin);
      assert.ok(preflight.headers.get('access-control-allow-methods')?.includes('PUT'));
      const allowed = preflight.headers.get('access-control-allow-headers')?.toLowerCase() ?? '';
      assert.ok(allowed === '*' || ['content-type', 'x-amz-checksum-sha256'].every((header) => allowed.includes(header)));
    }
    stage = 'signed upload and checksum';
    const upload = await fetchProbe(target.upload.url, {
      method: 'PUT', headers: target.upload.headers, body: payload,
    });
    await upload.body?.cancel();
    assert.ok(upload.ok, 'Signed attachment upload failed');
    const object = await attachments.getObject(target.storageRef);
    const parts = [];
    for await (const part of object.body) parts.push(Buffer.from(part));
    assert.deepEqual(Buffer.concat(parts), payload);
    assert.ok(object.version, 'S3 must expose ETag or VersionId for sealing');
    stage = 'attachment sealing';
    const attachment = { id, name: 'probe.txt', mimeType: 'text/plain', storageRef: target.storageRef };
    const sealed = await attachments.sealValidatedObject({
      attachment, checksumSha256: sha256, contentType: 'text/plain',
      sizeBytes: payload.length, sourceVersion: object.version,
    });
    cleanup.add(sealed.storageRef);
    attachment.storageRef = sealed.storageRef;
    stage = 'signed attachment and model reads';
    for (const read of [await attachments.createReadTarget(attachment), await attachments.createModelReadTarget(attachment)]) {
      const response = await fetchProbe(read.url);
      assert.ok(response.ok, 'Signed attachment read failed');
      assert.deepEqual(Buffer.from(await response.arrayBuffer()), payload);
    }
  } catch (error) {
    console.error(`S3 compatibility check failed at: ${stage}`);
    failure = error;
  } finally {
    const deleted = await Promise.allSettled([...cleanup].map((Key) =>
      client.send(new DeleteObjectCommand({ Bucket: config.bucket, Key }))));
    client.destroy();
    attachments.client.destroy();
    if (deleted.some((result) => result.status === 'rejected')) {
      console.error(`Probe cleanup incomplete; inspect only this prefix: ${prefix}`);
      failure ??= new Error('Probe cleanup failed');
    }
  }
  if (failure) throw failure;
  return { ok: true, corsChecked: Boolean(origin) };
}

if (isMain(import.meta)) {
  try {
    if (!process.argv.includes('--write-probe')) throw new Error('Pass --write-probe explicitly');
    const config = readStorageConfig(process.env, { allowLocal: process.argv.includes('--allow-local') });
    console.log(JSON.stringify(await probeStorage(config, { origin: process.env.S3_PROBE_ORIGIN })));
  } catch (error) {
    reportFailure('S3 compatibility probe', error);
  }
}
