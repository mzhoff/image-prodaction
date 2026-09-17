import type { Pool, PoolClient } from 'pg';
import { getPostgresPool } from '@/shared/db/client';
import {
  applyModelPreferenceChange, emptyAccountModelPreferences,
  type ModelModality, type ModelPreference, type ModelPreferenceChange,
} from '@/shared/model-preferences/contracts';

/** One succeeded job counts once, including short AI calls. Attempts/usage revisions do not count again.
 * Service-client jobs belong to the integration, not the human who created its credentials. */
export const ACCOUNT_MODEL_POPULARITY_SQL = `
  SELECT CASE
    WHEN operation IN ('generate_image', 'refine_image', 'edit_image') THEN 'image'
    WHEN operation = 'generate_video' THEN 'video'
    WHEN operation IN ('generate_speech', 'generate_speech_long', 'transcribe_audio') THEN 'audio'
    WHEN operation IN ('generate_text', 'analyze_image', 'describe_subject', 'describe_location',
      'format_telegram_text', 'timeline_describe', 'timeline_describe_shot') THEN 'text'
  END AS modality, model_id, count(*)::integer AS count
  FROM generation_job
  WHERE created_by_user_id = $1 AND status = 'succeeded' AND provider = 'openrouter'
    AND service_client_id IS NULL AND model_id <> 'openrouter/auto'
  GROUP BY modality, model_id`;

type Queryable = Pick<PoolClient, 'query'>;
export async function readAccountModelPreferences(userId: string, db: Queryable = getPostgresPool()) {
  const [preferences, popularity] = await Promise.all([
    db.query<ModelPreference & { modality: ModelModality }>(
      'SELECT modality, favorites, tab, revision FROM account_model_preference WHERE user_id = $1', [userId]),
    db.query<{ modality: ModelModality | null; model_id: string; count: number }>(ACCOUNT_MODEL_POPULARITY_SQL, [userId]),
  ]);
  const result = emptyAccountModelPreferences(userId);
  for (const { modality, ...preference } of preferences.rows) result.preferences[modality] = preference;
  for (const row of popularity.rows) if (row.modality) result.popularity[row.modality][row.model_id] = row.count;
  return result;
}

/** Caller owns the transaction. The row lock serializes independent tabs/devices for this account/type. */
export async function writeModelPreferenceInTransaction(db: Queryable, userId: string, change: ModelPreferenceChange) {
  await db.query(`INSERT INTO account_model_preference (user_id, modality) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [userId, change.modality]);
  const { rows: [current] } = await db.query<ModelPreference>(
    'SELECT favorites, tab, revision FROM account_model_preference WHERE user_id = $1 AND modality = $2 FOR UPDATE', [userId, change.modality]);
  const next = applyModelPreferenceChange(current, change);
  if (next.favorites.length > 500) throw new Error('favorite_limit');
  const { rows: [saved] } = await db.query<ModelPreference>(
    `UPDATE account_model_preference SET favorites = $3::jsonb, tab = $4, revision = revision + 1, updated_at = now()
     WHERE user_id = $1 AND modality = $2 RETURNING favorites, tab, revision`,
    [userId, change.modality, JSON.stringify(next.favorites), next.tab]);
  return saved;
}
export async function writeAccountModelPreference(userId: string, change: ModelPreferenceChange, pool: Pool = getPostgresPool()) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await writeModelPreferenceInTransaction(client, userId, change);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
}
