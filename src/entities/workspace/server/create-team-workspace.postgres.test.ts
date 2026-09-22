import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { drizzle } from 'drizzle-orm/node-postgres';
import { eq } from 'drizzle-orm';
import { Pool } from 'pg';
import * as schema from '@/shared/db/schema';
import { user } from '@/shared/db/schema/auth';
import { workspace, membership } from '@/shared/db/schema/workspace';
import { createUuidV7 } from '@/shared/lib/id';
import { createTeamWorkspace, WorkspaceCreateConflict } from './create-team-workspace';

test('PostgreSQL: workspace creation is atomic, retry-safe and cannot claim or revive ownership', { skip: !process.env.WORKSPACE_TEST_DATABASE_URL }, async () => {
  const pool = new Pool({ connectionString: process.env.WORKSPACE_TEST_DATABASE_URL });
  const db = drizzle(pool, { schema });
  const rollback = new Error('rollback_workspace_fixture');
  const input = { name: 'QA workspace', creationId: createUuidV7() };
  try {
    await db.transaction(async (tx) => {
      const owner = randomUUID(), other = randomUUID();
      await tx.insert(user).values([owner, other].map((id) => ({ id, name: 'Workspace QA', termsAcceptedAt: new Date(), termsVersion: 'test' })));
      const created = await createTeamWorkspace(owner, input, tx);
      assert.deepEqual(await createTeamWorkspace(owner, input, tx), created);
      assert.equal((await tx.select().from(workspace).where(eq(workspace.id, created.id))).length, 1);
      const members = await tx.select().from(membership).where(eq(membership.workspaceId, created.id));
      assert.deepEqual(members.map((member) => ({ userId: member.userId, role: member.role })), [{ userId: owner, role: 'owner' }]);
      await assert.rejects(createTeamWorkspace(other, input, tx), WorkspaceCreateConflict);
      await assert.rejects(createTeamWorkspace(owner, { ...input, name: 'Changed retry' }, tx), WorkspaceCreateConflict);
      await tx.delete(membership).where(eq(membership.workspaceId, created.id));
      await assert.rejects(createTeamWorkspace(owner, input, tx), WorkspaceCreateConflict);
      assert.equal((await tx.select().from(membership).where(eq(membership.workspaceId, created.id))).length, 0);
      const failedId = createUuidV7();
      await assert.rejects(createTeamWorkspace(randomUUID(), { ...input, creationId: failedId }, tx));
      assert.equal((await tx.select().from(workspace).where(eq(workspace.id, failedId))).length, 0);
      throw rollback;
    });
  } catch (error) { if (error !== rollback) throw error; }
  finally { await pool.end(); }
});
