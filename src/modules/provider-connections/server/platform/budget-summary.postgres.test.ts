import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from '@/shared/db/schema';
import { user } from '@/shared/db/schema/auth';
import { membership, workspace } from '@/shared/db/schema/workspace';
import { listBudgetMemberships } from './budget-summary';

const databaseUrl = process.env.PLATFORM_BUDGET_TEST_DATABASE_URL;
test('PostgreSQL: summary is scoped to exact Identity subject and current memberships', {
  skip: !databaseUrl,
}, async () => {
  const pool = new Pool({ connectionString: databaseUrl });
  const db = drizzle(pool, { schema });
  const rollback = new Error('test_rollback');
  const issuer = 'https://local-budget-test.example/auth';
  const owner = randomUUID(), member = randomUUID(), stranger = randomUUID();
  const first = randomUUID(), second = randomUUID();
  try {
    await db.transaction(async (tx) => {
      await tx.insert(user).values([owner, member, stranger].map((id) => ({
        id, name: 'Budget test fixture', identitySubject: `${issuer}#${id}`,
        termsAcceptedAt: new Date(), termsVersion: 'test-fixture',
      })));
      await tx.insert(workspace).values([
        { id: first, name: 'First', createdByUserId: owner },
        { id: second, name: 'Second', createdByUserId: stranger },
      ]);
      await tx.insert(membership).values([
        { workspaceId: first, userId: owner, role: 'owner' },
        { workspaceId: first, userId: member, role: 'member' },
        { workspaceId: second, userId: stranger, role: 'owner' },
      ]);
      const owned = await listBudgetMemberships(issuer, owner, tx);
      assert.deepEqual(owned.map((r) => [r.id, r.role]), [[first, 'owner']]);
      const joined = await listBudgetMemberships(issuer, member, tx);
      assert.deepEqual(joined.map((r) => [r.id, r.role]), [[first, 'member']]);
      assert.equal(joined[0].credentialId, null);
      assert.deepEqual(await listBudgetMemberships('https://forged.example/auth', member, tx), []);
      assert.deepEqual(await listBudgetMemberships(issuer, 'unknown', tx), []);
      await tx.delete(membership).where(eq(membership.userId, member));
      assert.deepEqual(await listBudgetMemberships(issuer, member, tx), []);
      throw rollback;
    });
  } catch (error) { if (error !== rollback) throw error; }
  finally { await pool.end(); }
});
