import assert from 'node:assert/strict';
import test from 'node:test';
import { and } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { projectMediaConditions } from './project-media-query';

function query(storyAssetIds: string[]) {
  return new PgDialect().sqlToQuery(and(...projectMediaConditions({ workspaceId: 'workspace-a', folderId: 'folder-a', storyAssetIds }))!);
}

test('story references join the folder flow relation but cannot bypass asset workspace and visibility', () => {
  const result = query(['story-image']);
  assert.match(result.sql, /"asset"\."workspace_id" = \$1 and "asset"\."status" = \$2 and "asset"\."library_visible" = \$3 and \(/);
  assert.match(result.sql, /"document"\."workspace_id"/);
  assert.match(result.sql, /"document"\."folder_id"/);
  assert.match(result.sql, /or "asset"\."id" in/);
  assert.equal(result.params[0], 'workspace-a');
  assert.match(result.sql, /"generation_job"\."workspace_id"/);
  assert.match(result.sql, /home_chat_generation hg join production_chat pc/);
  assert.ok(result.params.includes('folder-a'));
  assert.ok(result.params.includes('ready'));
  assert.ok(result.params.includes(true));
});

test('empty project references never broaden to the entire workspace library', () => {
  const result = query([]);
  assert.match(result.sql, /exists \(select 1 from "document"/);
  assert.match(result.sql, /pc.folder_id =/);
  assert.match(result.sql, /hg.workspace_id =/);
  assert.ok(result.params.includes('folder-a'));
});
