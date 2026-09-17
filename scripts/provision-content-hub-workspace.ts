import { config } from 'dotenv';
import { eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { getDb, getPostgresPool } from '@/shared/db/client';
import { user } from '@/shared/db/schema/auth';
import { membership, workspace } from '@/shared/db/schema/workspace';
import { requireRuntimeAdmin, type RuntimeSessionActor } from '@/modules/executable-pipelines/server/runtime-client-auth';
import { prepareContentHubCopies } from '@/modules/executable-pipelines/server/content-hub-copy-service';
import { installContentHubPreset } from '@/modules/executable-pipelines/server/content-hub-preset-service';
import { createRuntimeClient, listRuntimeClients } from '@/modules/executable-pipelines/server/runtime-client-service';

config({ path: '.env.local', quiet: true });
config({ path: '.env', quiet: true });
try {
  const args = process.argv.slice(2);
  const apply = args.includes('--apply');
  const values = args.filter((arg) => arg !== '--apply');
  const options: Record<string, string> = {};
  for (let i = 0; i < values.length; i += 2) {
    const key = values[i]?.replace(/^--/, '');
    if (!key || !['user', 'source-workspace', 'source-client', 'workspace', 'name'].includes(key) || options[key] || !values[i + 1]) throw new Error('Invalid options.');
    options[key] = values[i + 1]!;
  }
  const adminId = z.string().min(1).parse(options.user);
  const destinationId = z.uuid().parse(options.workspace);
  const name = z.string().trim().min(1).max(120).parse(options.name);
  const source: RuntimeSessionActor = { kind: 'session', userId: adminId, workspaceId: z.uuid().parse(options['source-workspace']) };
  if (source.workspaceId === destinationId) throw new Error('Destination must differ from personal source.');
  await requireRuntimeAdmin(source);
  const [admin] = await getDb().select({ id: user.id }).from(user).where(eq(user.id, adminId));
  if (!admin) throw new Error('Existing IP administrator user required.');
  const copies = await prepareContentHubCopies(source, z.uuid().parse(options['source-client']));
  const [existing] = await getDb().select().from(workspace).where(eq(workspace.id, destinationId));
  if (existing && (existing.kind !== 'team' || existing.name !== name)) throw new Error('Canonical workspace already exists with different metadata.');
  if (!apply) console.log(JSON.stringify({ dryRun: true, workspaceId: destinationId, name, administrator: adminId, capabilities: copies.map((copy) => copy.capabilityKey), paidRunExecuted: false }));
  else {
    await getDb().transaction(async (tx) => {
      await tx.insert(workspace).values({ id: destinationId, name, kind: 'team', createdByUserId: adminId }).onConflictDoNothing();
      await tx.insert(membership).values({ workspaceId: destinationId, userId: adminId, role: 'admin' }).onConflictDoUpdate({
        target: [membership.workspaceId, membership.userId],
        set: { role: sql`case when ${membership.role} = 'owner' then 'owner'::membership_role else 'admin'::membership_role end` },
      });
    });
    const actor: RuntimeSessionActor = { ...source, workspaceId: destinationId };
    const clients = await listRuntimeClients(actor);
    const client = clients.find((item) => item.sourceApplication === 'content-hub' && item.externalWorkspaceRef === destinationId)
      ?? await createRuntimeClient(actor, { displayName: `Content Hub — ${name}`, sourceApplication: 'content-hub', externalWorkspaceRef: destinationId,
        scopes: ['pipeline.catalog.read', 'pipeline.descriptor.read', 'pipeline.run.create', 'pipeline.run.read', 'pipeline.run.cancel', 'pipeline.artifact.read'],
      }, copies);
    console.log(JSON.stringify({ client, ...await installContentHubPreset(actor, client.id, copies), administrator: adminId }));
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Provisioning failed.');
  process.exitCode = 1;
} finally { await getPostgresPool().end().catch(() => undefined); }
