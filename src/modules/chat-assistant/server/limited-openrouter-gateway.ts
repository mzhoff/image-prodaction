import {
  OpenRouterClient,
  type ToolCallingLanguageModelGateway,
  type ToolCallingLanguageModelInput,
} from '@prodactionpro/chat-connectors';
import { collectSafeToolInputDiagnostics } from './tool-input-diagnostics';

export class LimitedOpenRouterGateway implements ToolCallingLanguageModelGateway {
  private readonly client: ToolCallingLanguageModelGateway;

  constructor(input: {
    apiKey: string;
    appTitle: string;
    baseUrl: string;
    httpReferer?: string;
    maxAttempts: number;
    maxOutputTokens: number;
    retryBaseDelayMs: number;
    retryDeadlineMs: number;
    client?: ToolCallingLanguageModelGateway;
    timeoutMs: number;
  }) {
    this.maxOutputTokens = input.maxOutputTokens;
    this.client = input.client ?? new OpenRouterClient({
      apiKey: input.apiKey,
      appTitle: input.appTitle,
      baseUrl: input.baseUrl,
      httpReferer: input.httpReferer,
      protectedErrorReporter: ({ responseBody: _responseBody, ...safeReport }) => {
        console.error('[chat-assistant-provider-attempt]', safeReport);
      },
      retryPolicy: {
        deadlineMs: input.retryDeadlineMs,
        initialBackoffMs: input.retryBaseDelayMs,
        maxAttempts: input.maxAttempts,
      },
      timeoutMs: input.timeoutMs,
    });
  }

  private readonly maxOutputTokens: number;

  async completeWithTools(input: ToolCallingLanguageModelInput) {
    const result = await this.client.completeWithTools({
      ...input,
      maxTokens: Math.min(input.maxTokens ?? this.maxOutputTokens, this.maxOutputTokens),
      temperature: input.temperature ?? 0.2,
    });
    for (const diagnostic of collectSafeToolInputDiagnostics(result)) {
      console.warn('[chat-assistant-tool-input-invalid]', diagnostic);
    }
    return result;
  }
}
