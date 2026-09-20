import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

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
