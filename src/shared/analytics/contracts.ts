export const BEHAVIOR_EVENTS = [
  'ip_app_opened', 'ip_document_opened', 'ip_document_created',
  'ip_document_imported', 'ip_document_exported', 'ip_node_added',
  'ip_generation_requested', 'ip_assistant_opened', 'ip_assistant_message_sent',
  'ip_login_viewed', 'ip_login_method_clicked', 'ip_telegram_open_clicked',
  'ip_login_challenge_ready', 'ip_login_terms_viewed', 'ip_login_terms_accepted',
  'ip_login_succeeded', 'ip_login_failed', 'ip_login_expired', 'ip_login_restarted',
  'ip_questionnaire_step_viewed', 'ip_questionnaire_step_completed',
  'ip_questionnaire_validation_failed', 'ip_questionnaire_save_failed',
  'ip_questionnaire_back', 'ip_questionnaire_completed', 'ip_questionnaire_left',
  'ip_tour_opened', 'ip_tour_step_viewed', 'ip_tour_completed', 'ip_tour_skipped',
  'ip_topup_clicked', 'ip_topup_viewed', 'ip_topup_amount_selected',
  'ip_topup_instructions_viewed', 'ip_topup_telegram_clicked',
  'ip_topup_handoff_created', 'ip_topup_handoff_failed',

] as const;

export type BehaviorEvent = typeof BEHAVIOR_EVENTS[number];
export type BehaviorParams = {
  source?: string; operation?: string; node_type?: string;
  method?: string; section?: string; step?: number; amount_usd?: number;
  selection?: string; elapsed_ms?: number; active_ms?: number;
  step_elapsed_ms?: number; step_active_ms?: number;
};
export type AnalyticsConfig = {
  mode: 'off' | 'debug' | 'live';
  counterId: number | null;
  allowedHosts: string[];
};

// Deliberately projected here: the shared SDK cannot depend on graph entities.
// New graph types fall back to "other" until explicitly added to this contract.
const NODE_TYPES = new Set([
  'importImage', 'textPrompt', 'textConcat', 'textGeneration', 'textToSpeech',
  'speechToText', 'audioConvert', 'timelineHandoff', 'reverieStories',
  'textFormatter', 'textSplitter', 'pipelineInput', 'pipelineOutput',
  'structuredOutput', 'iterator', 'router', 'subjectBuilder', 'locationBuilder',
  'telegramPublication', 'imageToText', 'qrCode', 'referenceComposer',
  'composition', 'generateImage', 'generateVideo', 'sketch', 'cropImage',
  'adjustment', 'curves', 'frequencyRetouch', 'refineImage', 'removeBackground',
  'exportImage', 'banner', 'preview',
]);
const OPERATIONS = new Set([
  'project_snapshot', 'pipeline_template', 'generate_image', 'generate_text',
  'generate_video', 'generate_speech',
]);

export function sanitizeBehaviorParams(input: BehaviorParams = {}): BehaviorParams {
  const result: BehaviorParams = {};
  const sources = ['editor', 'workspace', 'home', 'login', 'profile_menu', 'usage_header',
    'usage_empty', 'canvas_balance', 'provider_settings', 'ai_access_dialog',
    'ai_access_banner', 'direct', 'automatic', 'help'];
  if (input.source && sources.includes(input.source)) result.source = input.source;
  if (input.method && ['telegram', 'email'].includes(input.method)) result.method = input.method;
  if (input.section && ['home', 'create', 'editor', 'flows', 'library', 'usage', 'pipelines', 'stories', 'timeline', 'storyboard', 'community', 'settings'].includes(input.section)) result.section = input.section;
  if (input.selection && ['preset', 'custom'].includes(input.selection)) result.selection = input.selection;
  for (const key of ['step', 'amount_usd', 'elapsed_ms', 'active_ms', 'step_elapsed_ms', 'step_active_ms'] as const) {
    const value = input[key];
    const max = key === 'step' ? 30 : key === 'amount_usd' ? 200 : 30 * 86400_000;
    if (typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= max) result[key] = Math.round(value);
  }
  if (input.operation && OPERATIONS.has(input.operation)) result.operation = input.operation;
  if (input.node_type) result.node_type = NODE_TYPES.has(input.node_type) ? input.node_type : 'other';
  return result;
}

export function analyticsUserId(id: string | null): string | null {
  return id && /^[a-zA-Z0-9_-]{1,128}$/.test(id) ? `ip_${id}` : null;
}
