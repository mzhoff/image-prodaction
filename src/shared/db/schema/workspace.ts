import { relations, sql } from 'drizzle-orm';
import { index, pgEnum, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { user } from './auth';

export const workspaceKind = pgEnum('workspace_kind', ['personal', 'team']);
export const membershipRole = pgEnum('membership_role', ['owner', 'admin', 'member']);

export const workspace = pgTable('workspace', {
  id: uuid('id').primaryKey(),
  name: text('name').notNull(),
  kind: workspaceKind('kind').default('personal').notNull(),
  createdByUserId: text('created_by_user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'restrict' }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
}, (table) => [
  uniqueIndex('workspace_personal_creator_unique')
    .on(table.createdByUserId)
    .where(sql`${table.kind} = 'personal'`),
]);

export const membership = pgTable('membership', {
  workspaceId: uuid('workspace_id')
    .notNull()
    .references(() => workspace.id, { onDelete: 'cascade' }),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  role: membershipRole('role').default('member').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  primaryKey({ columns: [table.workspaceId, table.userId], name: 'membership_pk' }),
  index('membership_user_idx').on(table.userId),
]);

export const workspaceRelations = relations(workspace, ({ many, one }) => ({
  creator: one(user, { fields: [workspace.createdByUserId], references: [user.id] }),
  memberships: many(membership),
}));

export const membershipRelations = relations(membership, ({ one }) => ({
  user: one(user, { fields: [membership.userId], references: [user.id] }),
  workspace: one(workspace, { fields: [membership.workspaceId], references: [workspace.id] }),
}));
