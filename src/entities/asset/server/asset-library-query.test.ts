import assert from 'node:assert/strict';
import test from 'node:test';
import { and } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { createLibraryConditions } from './asset-library-query';

test('folder filter is a scoped document relation, including empty folders, never a name guess', () => {
  const input = { userId: 'u', workspaceId: 'workspace-a', folderId: 'folder-b', limit: 20 };
  const query = new PgDialect().sqlToQuery(and(...createLibraryConditions(input))!);
  assert.match(query.sql, /exists \(select 1 from "document"/);
  assert.match(query.sql, /"document"\."folder_id"/);
  assert.match(query.sql, /"document"\."workspace_id"/);
  assert.match(query.sql, /"asset"\."workspace_id"/);
  assert.ok(query.params.includes('folder-b'));
  assert.equal(query.params.filter((value) => value === 'workspace-a').length, 2);
  assert.doesNotMatch(query.sql, /ilike/);
});
