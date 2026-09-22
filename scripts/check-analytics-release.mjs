import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { parseEnv } from 'node:util';
import { validateAnalyticsCompose, validatePublicAnalyticsProfile } from './analytics-release-profile.mjs';

const composeOptions = new Set(['-f', '--file', '--env-file', '-p', '--project-name', '--project-directory']);
const args = process.argv.slice(2);
const registry = JSON.parse(readFileSync(new URL('../deploy/analytics/image-production-beta.json', import.meta.url), 'utf8'));

try {
  for (let i = 0; i < args.length; i += 2) {
    if (!composeOptions.has(args[i]) || !args[i + 1] || args[i + 1].startsWith('-')) {
      throw new Error('Only Compose file, env-file, project-name and project-directory options are accepted.');
    }
  }
  if (!args.length) throw new Error('Pass the exact Compose files and env-files planned for this release.');
  const profile = parseEnv(readFileSync(new URL('../deploy/analytics/beta.public.env', import.meta.url), 'utf8'));
  validatePublicAnalyticsProfile(profile, registry);
  let resolved;
  try {
    // Read-only; no daemon mutation, image build, network creation or container start.
    // Expanded runtime secrets stay in memory. Never print stdout/stderr on failure.
    resolved = JSON.parse(execFileSync('docker', ['compose', ...args, 'config', '--format', 'json'], {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 16 * 1024 * 1024,
    }));
  } catch {
    throw new Error('Compose configuration could not be resolved. Check input files and required settings.');
  }
  const result = validateAnalyticsCompose(resolved, registry);
  console.log(`Analytics release profile valid: counter ${result.counterId}, host ${result.host}, ${result.goals} goals. No deployment performed.`);
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Analytics release profile validation failed.');
  process.exitCode = 1;
}
