import {
  CHAT_ASSISTANT_DEFAULT_MODEL,
  CHAT_ASSISTANT_MODE,
  type PublicChatAssistantConfig,
} from '../contracts/assistant-config';

export interface ChatAssistantServerConfig extends PublicChatAssistantConfig {
  apiKey?: string;
  approvalSecret?: string;
  maxCostUsdPerTurn: number;
  maxOutputTokens: number;
  maxToolCallsPerTurn: number;
  providerMaxAttempts: number;
  providerRetryBaseDelayMs: number;
  openRouterBaseUrl: string;
  openRouterSiteUrl?: string;
  providerRequestTimeoutMs: number;
}

export function readChatAssistantConfig(): ChatAssistantServerConfig {
  const apiKey = readOptionalString('CHAT_OPENROUTER_API_KEY');
  const approvalSecret = readOptionalString('CHAT_TOOL_APPROVAL_SECRET');
  const requestedEnabled = process.env.CHAT_ASSISTANT_ENABLED === 'true';
  const missingSettings = [
    ...(!apiKey ? ['CHAT_OPENROUTER_API_KEY'] : []),
    ...(!approvalSecret || approvalSecret.length < 32 ? ['CHAT_TOOL_APPROVAL_SECRET'] : []),
  ];

  return {
    apiKey,
    approvalSecret,
    enabled: requestedEnabled && missingSettings.length === 0,
    maxCostUsdPerTurn: readPositiveNumber('CHAT_ASSISTANT_MAX_COST_USD_PER_TURN', 0.01, 1),
    maxOutputTokens: readPositiveInteger('CHAT_ASSISTANT_MAX_OUTPUT_TOKENS', 1_200, 4_000),
    maxToolCallsPerTurn: readPositiveInteger('CHAT_ASSISTANT_MAX_TOOL_CALLS_PER_TURN', 6, 8),
    missingSettings: requestedEnabled ? missingSettings : ['CHAT_ASSISTANT_ENABLED'],
    mode: CHAT_ASSISTANT_MODE,
    model: readOptionalString('CHAT_ASSISTANT_MODEL') ?? CHAT_ASSISTANT_DEFAULT_MODEL,
    openRouterBaseUrl: readOptionalString('CHAT_OPENROUTER_BASE_URL') ?? 'https://openrouter.ai/api/v1',
    openRouterSiteUrl: readOptionalString('OPENROUTER_SITE_URL'),
    providerMaxAttempts: readPositiveInteger('CHAT_ASSISTANT_PROVIDER_MAX_ATTEMPTS', 3, 4),
    providerRetryBaseDelayMs: readPositiveInteger('CHAT_ASSISTANT_PROVIDER_RETRY_BASE_MS', 750, 5_000),
    providerRequestTimeoutMs: readPositiveInteger('CHAT_ASSISTANT_PROVIDER_TIMEOUT_MS', 120_000, 120_000),
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
