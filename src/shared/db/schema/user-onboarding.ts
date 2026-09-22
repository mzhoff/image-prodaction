import { boolean, integer, jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { user } from './auth';
import type { OnboardingAnswers } from '@/shared/onboarding/contract';

export const userOnboarding = pgTable('user_onboarding', {
  userId: text('user_id').primaryKey().references(() => user.id, { onDelete: 'cascade' }),
  version: integer('version').notNull().default(1), step: text('step').notNull().default('about'),
  answers: jsonb('answers').$type<OnboardingAnswers>().notNull().default({} as OnboardingAnswers),
  locale: text('locale').notNull().default('ru'), theme: text('theme').notNull().default('system'),
  revision: integer('revision').notNull().default(0), returnTo: text('return_to').notNull().default('/'),
  legacyExempt: boolean('legacy_exempt').notNull().default(false),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
});
