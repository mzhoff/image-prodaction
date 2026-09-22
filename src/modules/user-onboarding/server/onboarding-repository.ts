import type { Pool } from 'pg';
import { getPostgresPool } from '@/shared/db/client';
import { getSafePostAuthPath } from '@/shared/auth/route-policy';
import { emptyOnboarding, normalizeAnswers, ONBOARDING_STEPS, OnboardingConflict, OnboardingInvalid,
  stepMissing, type OnboardingChange, type OnboardingState } from '@/shared/onboarding/contract';

type Row = { user_id: string; version: number; step: OnboardingState['step']; answers: OnboardingState['answers'];
  locale: OnboardingState['locale']; theme: OnboardingState['theme']; revision: number; return_to: string;
  legacy_exempt: boolean; completed_at: Date | null };
function state(row: Row, name: string): OnboardingState {
  return { ...emptyOnboarding(row.user_id, name), version: row.version, step: row.step,
    answers: { ...emptyOnboarding(row.user_id, name).answers, ...row.answers, company: '' }, locale: row.locale,
    theme: row.theme, revision: row.revision, returnTo: row.return_to,
    legacyExempt: row.legacy_exempt, completedAt: row.completed_at?.toISOString() ?? null };
}
export async function readOnboarding(userId: string, name = '', pool = getPostgresPool()) {
  const { rows: [row] } = await pool.query<Row>('SELECT * FROM user_onboarding WHERE user_id = $1', [userId]);
  return row ? state(row, name) : emptyOnboarding(userId, name);
}
export async function needsOnboarding(userId: string) {
  const value = await readOnboarding(userId);
  return !value.completedAt && !value.legacyExempt;
}
export async function saveOnboarding(userId: string, change: OnboardingChange, pool: Pool = getPostgresPool()) {
  const answers = normalizeAnswers(change.answers);
  if (change.complete && ONBOARDING_STEPS.some((step) => stepMissing(step, answers).length)) {
    throw new OnboardingInvalid('Ответьте на обязательные вопросы.');
  }
  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    await db.query('INSERT INTO user_onboarding (user_id) VALUES ($1) ON CONFLICT DO NOTHING', [userId]);
    const { rows: [current] } = await db.query<Row>('SELECT * FROM user_onboarding WHERE user_id=$1 FOR UPDATE', [userId]);
    if (current.revision !== change.revision) throw new OnboardingConflict('Анкета изменена в другой вкладке. Обновите её, чтобы продолжить.');
    const { rows: [saved] } = await db.query<Row>(`UPDATE user_onboarding SET answers=$2::jsonb, step=$3,
      locale=$4, theme=$5, revision=revision+1, updated_at=now(), return_to=$6,
      completed_at=CASE WHEN $7 THEN COALESCE(completed_at,now()) ELSE completed_at END
      WHERE user_id=$1 RETURNING *`, [userId, JSON.stringify(answers), change.step, change.locale, change.theme,
      safeOnboardingReturn(change.returnTo ?? current.return_to), Boolean(change.complete)]);
    await db.query('COMMIT');
    return state(saved, answers.name);
  } catch (error) { await db.query('ROLLBACK'); throw error; }
  finally { db.release(); }
}
export function safeOnboardingReturn(value?: string | null) {
  const path = getSafePostAuthPath(value);
  return /^\/onboarding(?:[/?#]|$)/.test(path) ? '/' : path;
}
