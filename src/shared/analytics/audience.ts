import { answerOptions } from '@/shared/onboarding/contract';
import { analyticsUserId } from './contracts';

export type AnalyticsAudience = { userId: string; params: Record<string, string> };
const fields = { age_group: 'age', role: 'role', work_type: 'work', team_size: 'team',
  industry: 'industry', ai_experience: 'experience', agent_experience: 'agents', automation: 'automation' } as const;

/** Deliberate projection: never serialize names, free text, contacts or the full questionnaire. */
export function projectAnalyticsAudience(userId: string, source: {
  answers?: unknown; completedAt?: string | null; legacyExempt?: boolean;
}): AnalyticsAudience | null {
  const id = analyticsUserId(userId);
  if (!id) return null;
  const params: Record<string, string> = {
    profile_schema: '1', onboarding_status: source.completedAt ? 'completed' : source.legacyExempt ? 'legacy' : 'in_progress',
  };
  // Incomplete answers are drafts, not a reliable audience segment.
  const a = source.completedAt && source.answers && typeof source.answers === 'object'
    ? source.answers as Record<string, unknown> : {};
  for (const [name, field] of Object.entries(fields)) {
    const value = a[field];
    params[name] = typeof value === 'string' && (answerOptions[field] as readonly string[]).includes(value) ? value : 'unknown';
  }
  for (const field of ['goals', 'tasks', 'tools'] as const) {
    for (const option of answerOptions[field]) {
      params[`${field}_${option}`] = source.completedAt ? Array.isArray(a[field]) && a[field].includes(option) ? 'yes' : 'no' : 'unknown';
    }
  }
  return { userId: id, params };
}

/** Recheck even our own endpoint at the browser boundary; arbitrary fields never reach Metrica. */
export function sanitizeAnalyticsAudience(value: unknown): AnalyticsAudience | null {
  if (!value || typeof value !== 'object') return null;
  const input = value as AnalyticsAudience;
  if (typeof input.userId !== 'string' || !/^ip_[a-zA-Z0-9_-]{1,128}$/.test(input.userId)
    || !input.params || typeof input.params !== 'object') return null;
  const params: Record<string, string> = { profile_schema: '1' };
  const status = input.params.onboarding_status;
  if (!['completed', 'legacy', 'in_progress'].includes(status)) return null;
  params.onboarding_status = status;
  for (const [name, field] of Object.entries(fields)) {
    const value = input.params[name];
    params[name] = (answerOptions[field] as readonly string[]).includes(value) ? value : 'unknown';
  }
  for (const field of ['goals', 'tasks', 'tools'] as const) for (const option of answerOptions[field]) {
    const key = `${field}_${option}`;
    params[key] = ['yes', 'no'].includes(input.params[key]) ? input.params[key] : 'unknown';
  }
  return { userId: input.userId, params };
}
