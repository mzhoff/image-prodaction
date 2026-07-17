import { jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

export const workerHeartbeat = pgTable('worker_heartbeat', {
  workerName: text('worker_name').primaryKey(),
  instanceId: text('instance_id').notNull(),
  status: text('status').notNull(),
  metadata: jsonb('metadata').$type<Record<string, unknown> | null>(),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull(),
});
