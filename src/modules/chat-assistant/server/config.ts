import {
  CHAT_ASSISTANT_DEFAULT_MODEL,
  CHAT_ASSISTANT_MODE,
  type PublicChatAssistantConfig,
} from '../contracts/assistant-config';

export interface ChatAssistantServerConfig extends PublicChatAssistantConfig {
  apiKey?: string;
  approvalSecret?: string;
  attachmentBucket?: string;
  attachmentEndpoint?: string;
  attachmentForcePathStyle: boolean;
  attachmentKeyPrefix: string;
  attachmentMaxBytes: number;
  attachmentMaxCount: number;
  attachmentMaxContextImages: number;
  attachmentModelDelivery: 'inline-bytes' | 'remote-url';
  attachmentReadTtlSeconds: number;
  attachmentRegion: string;
  attachmentS3AccessKeyId?: string;
  attachmentS3SecretAccessKey?: string;
  attachmentUploadTtlSeconds: number;
  maxCostUsdPerTurn: number;
  maxOutputTokens: number;
  maxToolCallsPerTurn: number;
  providerMaxAttempts: number;
  providerRetryBaseDelayMs: number;
  providerRetryDeadlineMs: number;
  openRouterBaseUrl: string;
  openRouterSiteUrl?: string;
  providerRequestTimeoutMs: number;
  serverTurnDeadlineMs: number;
}

export function readChatAssistantConfig(): ChatAssistantServerConfig {
  const apiKey = readOptionalString('CHAT_OPENROUTER_API_KEY');
  const approvalSecret = readOptionalString('CHAT_TOOL_APPROVAL_SECRET');
  const attachmentBucket = readOptionalString('S3_BUCKET');
  const requestedEnabled = process.env.CHAT_ASSISTANT_ENABLED === 'true';
  const missingSettings = [
    ...(!apiKey ? ['CHAT_OPENROUTER_API_KEY'] : []),
    ...(!approvalSecret || approvalSecret.length < 32 ? ['CHAT_TOOL_APPROVAL_SECRET'] : []),
    ...(!attachmentBucket ? ['S3_BUCKET'] : []),
  ];

  return {
    apiKey,
    approvalSecret,
    attachmentBucket,
    attachmentEndpoint: readOptionalString('CHAT_ATTACHMENT_S3_ENDPOINT') ?? readOptionalString('S3_ENDPOINT'),
    attachmentForcePathStyle: readBoolean(
      'CHAT_ATTACHMENT_S3_FORCE_PATH_STYLE',
      readBoolean('S3_FORCE_PATH_STYLE', Boolean(readOptionalString('S3_ENDPOINT'))),
    ),
    attachmentKeyPrefix: readOptionalString('CHAT_ATTACHMENT_S3_KEY_PREFIX') ?? 'chat-attachments',
    attachmentMaxBytes: readPositiveInteger('CHAT_ATTACHMENT_MAX_BYTES', 8 * 1024 * 1024, 15 * 1024 * 1024),
    attachmentMaxCount: readPositiveInteger('CHAT_ATTACHMENT_MAX_COUNT', 3, 6),
    attachmentMaxContextImages: readPositiveInteger('CHAT_ATTACHMENT_MAX_CONTEXT_IMAGES', 6, 12),
    attachmentModelDelivery: readAttachmentModelDelivery(),
    attachmentReadTtlSeconds: readPositiveInteger('CHAT_ATTACHMENT_READ_TTL_SECONDS', 900, 3_600),
    attachmentRegion: readOptionalString('S3_REGION') ?? readOptionalString('AWS_REGION') ?? 'us-east-1',
    attachmentS3AccessKeyId: readOptionalString('S3_ACCESS_KEY_ID') ?? readOptionalString('AWS_ACCESS_KEY_ID'),
    attachmentS3SecretAccessKey: readOptionalString('S3_SECRET_ACCESS_KEY') ?? readOptionalString('AWS_SECRET_ACCESS_KEY'),
    attachmentUploadTtlSeconds: readPositiveInteger('CHAT_ATTACHMENT_UPLOAD_TTL_SECONDS', 900, 3_600),
    enabled: requestedEnabled && missingSettings.length === 0,
    maxCostUsdPerTurn: readPositiveNumber('CHAT_ASSISTANT_MAX_COST_USD_PER_TURN', 0.01, 1),
    maxOutputTokens: readPositiveInteger('CHAT_ASSISTANT_MAX_OUTPUT_TOKENS', 3_600, 4_000),
    maxToolCallsPerTurn: readPositiveInteger('CHAT_ASSISTANT_MAX_TOOL_CALLS_PER_TURN', 6, 8),
    missingSettings: requestedEnabled ? missingSettings : ['CHAT_ASSISTANT_ENABLED'],
    mode: CHAT_ASSISTANT_MODE,
    model: readOptionalString('CHAT_ASSISTANT_MODEL') ?? CHAT_ASSISTANT_DEFAULT_MODEL,
    openRouterBaseUrl: readOptionalString('CHAT_OPENROUTER_BASE_URL') ?? 'https://openrouter.ai/api/v1',
    openRouterSiteUrl: readOptionalString('OPENROUTER_SITE_URL'),
    providerMaxAttempts: readPositiveInteger('CHAT_ASSISTANT_PROVIDER_MAX_ATTEMPTS', 3, 4),
    providerRetryBaseDelayMs: readPositiveInteger('CHAT_ASSISTANT_PROVIDER_RETRY_BASE_MS', 750, 5_000),
    providerRetryDeadlineMs: readPositiveInteger('CHAT_ASSISTANT_PROVIDER_RETRY_DEADLINE_MS', 70_000, 70_000),
    providerRequestTimeoutMs: readPositiveInteger('CHAT_ASSISTANT_PROVIDER_TIMEOUT_MS', 60_000, 60_000),
    serverTurnDeadlineMs: readPositiveInteger('CHAT_ASSISTANT_SERVER_TURN_DEADLINE_MS', 75_000, 75_000),
  };
}

export function toPublicChatAssistantConfig(config: ChatAssistantServerConfig): PublicChatAssistantConfig {
  return {
    enabled: config.enabled,
    missingSettings: config.missingSettings,
    mode: config.mode,
    model: config.model,
  };
}

function readOptionalString(name: string) {
  const value = process.env[name]?.trim();
  return value || undefined;
}

function readPositiveInteger(name: string, fallback: number, max: number) {
  const parsed = Number.parseInt(process.env[name] ?? '', 10);
  return Number.isInteger(parsed) && parsed > 0 ? Math.min(parsed, max) : fallback;
}

function readPositiveNumber(name: string, fallback: number, max: number) {
  const parsed = Number.parseFloat(process.env[name] ?? '');
  return Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, max) : fallback;
}

function readBoolean(name: string, fallback: boolean) {
  const value = readOptionalString(name)?.toLowerCase();
  return value ? ['1', 'true', 'yes', 'on'].includes(value) : fallback;
}

function readAttachmentModelDelivery(): 'inline-bytes' | 'remote-url' {
  return readOptionalString('CHAT_ATTACHMENT_MODEL_DELIVERY') === 'inline-bytes'
    ? 'inline-bytes'
    : 'remote-url';
}
