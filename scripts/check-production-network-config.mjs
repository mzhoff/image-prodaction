import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Capture expanded configuration in memory: runtime environments may hold secrets.
const config = JSON.parse(execFileSync('docker', [
  'compose', '--env-file', '.env.production.example',
  '-f', 'compose.production.yaml', '-f', 'compose.timeweb.yaml',
  '-f', 'compose.egress.yaml', 'config', '--format', 'json',
], { encoding: 'utf8' }));

for (const service of ['web', 'worker', 'pipeline-worker']) {
  const networks = config.services[service].networks;
  assert.ok(networks.provider_egress, `${service} must reach the provider tunnel`);
  for (const dependency of ['postgres', 'minio']) {
    assert.ok(
      Object.keys(config.services[dependency].networks).some((name) => name in networks),
      `${service} must retain a shared network with ${dependency}`,
    );
  }
}
for (const service of ['postgres', 'minio']) {
  assert.ok(!config.services[service].networks.provider_egress,
    `${service} must stay outside the provider transport network`);
}
console.log('Production services retain data and provider network connectivity.');

// No live configuration/credentials: prove external S3 works without MinIO secrets.
const fixtureDir = mkdtempSync(join(tmpdir(), 'reverie-compose-s3-'));
try {
  const fixture = join(fixtureDir, 'external.env');
  writeFileSync(fixture, readFileSync('.env.production.example', 'utf8')
    .split('\n').filter((line) => !line.startsWith('MINIO_ROOT_')).join('\n') + '\n'
    + 'S3_ENDPOINT=https://s3.test.example\nS3_REGION=ru-1\nS3_BUCKET=private-media\n'
    + 'S3_BACKUP_BUCKET=private-backups\nS3_BACKUP_ACCESS_KEY_ID=ops-only\n'
    + 'S3_BACKUP_SECRET_ACCESS_KEY=ops-secret-only\n'
    + 'CHAT_ATTACHMENT_S3_ENDPOINT=http://minio.localhost:9000\n');
  const env = { ...process.env };
  // Ambient developer config must not override the non-secret fixture.
  for (const key of Object.keys(env)) {
    if (/^(S3_|MINIO_|CHAT_ATTACHMENT_|COMPOSE_)/.test(key)) delete env[key];
  }
  const args = ['compose', '--env-file', fixture,
    '-f', 'compose.production.yaml', '-f', 'compose.timeweb.yaml',
    '-f', 'compose.egress.yaml', '-f', 'compose.storage-s3.yaml'];
  const external = JSON.parse(execFileSync('docker', [...args, 'config', '--format', 'json'], { encoding: 'utf8', env }));
  assert.ok(!external.services.minio && !external.services['minio-init'], 'MinIO must be inactive by default');
  assert.ok(!external.services['storage-backup'], 'Backups are an explicit operation');
  assert.ok(!external.services['storage-probe'], 'Probes are an explicit operation');
  for (const name of ['web', 'worker', 'pipeline-worker', 'migrate']) {
    const service = external.services[name];
    const storage = service.environment;
    assert.equal(storage.S3_ENDPOINT, 'https://s3.test.example');
    assert.equal(storage.S3_BUCKET, 'private-media');
    assert.equal(storage.S3_REGION, 'ru-1');
    assert.equal(storage.CHAT_ATTACHMENT_S3_ENDPOINT, storage.S3_ENDPOINT);
    assert.equal(storage.CHAT_ATTACHMENT_S3_FORCE_PATH_STYLE, storage.S3_FORCE_PATH_STYLE);
    assert.ok(!('minio' in (service.depends_on ?? {})));
    assert.ok(!('minio-init' in (service.depends_on ?? {})));
    assert.equal(storage.S3_ACCESS_KEY_ID, 'replace-with-a-random-access-key');
    assert.ok(!Object.values(storage).includes('ops-secret-only'));
    if (name !== 'migrate') assert.ok(service.networks.provider_egress);
    assert.ok('default' in service.networks);
  }
  const ops = JSON.parse(execFileSync('docker', [...args, '--profile', 'storage-ops', 'config', '--format', 'json'], { encoding: 'utf8', env }));
  assert.equal(ops.services['storage-backup'].environment.S3_ACCESS_KEY_ID, 'ops-only');
  assert.equal(ops.services['storage-backup'].environment.S3_BACKUP_BUCKET, 'private-backups');
  assert.equal(ops.services['storage-probe'].environment.S3_PROBE_ORIGIN, 'https://production.apption.space');
  assert.equal(ops.services['storage-probe'].environment.S3_ACCESS_KEY_ID, 'replace-with-a-random-access-key');
  assert.ok(!ops.services.minio);
  console.log('External S3: no MinIO dependency, shared asset/attachment endpoint, isolated backup credentials.');
} finally {
  rmSync(fixtureDir, { recursive: true, force: true });
}
