import { config } from 'dotenv';
import { readFile, unlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { getPostgresPool } from '@/shared/db/client';
import { RuntimeV2Error } from '@/modules/executable-pipelines/contracts/runtime-v2-errors';
import { runtimeV2IssueCredentialSchema } from '@/modules/executable-pipelines/contracts/runtime-v2-contracts';
import type { RuntimeSessionActor } from '@/modules/executable-pipelines/server/runtime-client-auth';
import { createRuntimeClient, issueRuntimeCredential, listRuntimeClients, revokeRuntimeCredential, setRuntimeClientEnabled } from '@/modules/executable-pipelines/server/runtime-client-service';
import { createRuntimeGrant, repinRuntimeGrant, setRuntimeGrantEnabled } from '@/modules/executable-pipelines/server/runtime-grant-service';
import { getRuntimeGrant, getRuntimeGrantUpdates } from '@/modules/executable-pipelines/server/runtime-grant-read-service';
import { openNewRuntimeCredentialFile } from '@/modules/executable-pipelines/server/runtime-credential-file';

config({ path: '.env.local', quiet: true });
config({ path: '.env', quiet: true });

try {
  const [command, ...args] = process.argv.slice(2);
  const options = parseOptions(args);
  const actor: RuntimeSessionActor = { kind: 'session', userId: required(options, 'user'), workspaceId: z.uuid().parse(required(options, 'workspace')) };
  const client = options.client ? z.uuid().parse(options.client) : undefined;
  const grant = options.grant ? z.uuid().parse(options.grant) : undefined;
  let result: unknown;
  switch (command) {
    case 'create-client': result = await createRuntimeClient(actor, await readRequest(options)); break;
    case 'list': result = await listRuntimeClients(actor); break;
    case 'issue':
    case 'rotate': {
      if (!client) throw new Error('client required');
      result = await issueToNewFile(actor, client, options);
      break;
    }
    case 'revoke-credential': {
      if (!client) throw new Error('client required');
      result = await revokeRuntimeCredential(actor, client, z.uuid().parse(required(options, 'credential'))); break;
    }
    case 'disable-client':
    case 'revoke-client':
    case 'enable-client': {
      if (!client) throw new Error('client required');
      result = await setRuntimeClientEnabled(actor, client, command === 'enable-client'); break;
    }
    case 'grant': {
      if (!client) throw new Error('client required');
      result = await createRuntimeGrant(actor, client, await readRequest(options)); break;
    }
    case 'inspect-grant': {
      if (!grant) throw new Error('grant required');
      result = { grant: await getRuntimeGrant(actor, grant), updates: await getRuntimeGrantUpdates(actor, grant) }; break;
    }
    case 'repin':
    case 'rollback': {
      if (!grant) throw new Error('grant required');
      result = await repinRuntimeGrant(actor, grant, await readRequest(options), command === 'rollback'); break;
    }
    case 'disable-grant':
    case 'revoke-grant':
    case 'enable-grant': {
      if (!grant) throw new Error('grant required');
      result = await setRuntimeGrantEnabled(actor, grant, command === 'enable-grant', z.coerce.number().int().positive().parse(required(options, 'revision'))); break;
    }
    default: throw new Error('Unknown operation');
  }
  console.log(JSON.stringify(result));
} catch (error) {
  console.error(error instanceof RuntimeV2Error ? `${error.code}: ${error.message}` : 'Runtime connection command failed. Check operation, options and request file; no secret was printed.');
  process.exitCode = 1;
} finally { await getPostgresPool().end().catch(() => undefined); }

function parseOptions(args: string[]) {
  const allowed = ['user', 'workspace', 'client', 'credential', 'grant', 'revision', 'request-file', 'token-file', 'label'];
  const result: Record<string, string> = {};
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i]?.replace(/^--/, '');
    const value = args[i + 1];
    if (!key || !args[i]!.startsWith('--') || !allowed.includes(key) || result[key] || !value || value.startsWith('--')) throw new Error('Invalid option');
    result[key] = value;
  }
  return result;
}
function required(options: Record<string, string>, key: string) {
  if (!options[key]) throw new Error('Missing option');
  return options[key];
}
async function readRequest(options: Record<string, string>) {
  const body = await readFile(resolve(required(options, 'request-file')), 'utf8');
  if (Buffer.byteLength(body) > 65_536) throw new Error('Request too large');
  return JSON.parse(body) as unknown;
}
async function issueToNewFile(actor: RuntimeSessionActor, clientId: string, options: Record<string, string>) {
  const body = runtimeV2IssueCredentialSchema.parse(options['request-file'] ? await readRequest(options) : { label: options.label ?? 'Primary server key' });
  const { file, handle } = await openNewRuntimeCredentialFile(
    required(options, 'token-file'), fileURLToPath(new URL('../', import.meta.url)),
  );
  let credentialId: string | undefined;
  let delivered = false;
  try {
    const issued = await issueRuntimeCredential(actor, clientId, body);
    credentialId = issued.credential.id;
    await handle.writeFile(`${issued.token}\n`, 'utf8');
    await handle.sync();
    delivered = true;
    return { credential: issued.credential, tokenFile: file };
  } finally {
    await handle.close();
    if (!delivered) {
      if (credentialId) await revokeRuntimeCredential(actor, clientId, credentialId);
      await unlink(file);
    }
  }
}
