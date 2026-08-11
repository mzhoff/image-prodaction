import {
  OpenRouterClient,
  type ToolCallingLanguageModelGateway,
  type ToolCallingLanguageModelInput,
} from '@prodactionpro/chat-connectors';

export class LimitedOpenRouterGateway implements ToolCallingLanguageModelGateway {
  private readonly client: OpenRouterClient;

  constructor(input: {
    apiKey: string;
    appTitle: string;
    baseUrl: string;
    httpReferer?: string;
    maxOutputTokens: number;
  }) {
    this.maxOutputTokens = input.maxOutputTokens;
    this.client = new OpenRouterClient({
      apiKey: input.apiKey,
      appTitle: input.appTitle,
      baseUrl: input.baseUrl,
      httpReferer: input.httpReferer,
      timeoutMs: 45_000,
    });
  }

  private readonly maxOutputTokens: number;

  completeWithTools(input: ToolCallingLanguageModelInput) {
    return this.client.completeWithTools({
      ...input,
      maxTokens: Math.min(input.maxTokens ?? this.maxOutputTokens, this.maxOutputTokens),
      temperature: input.temperature ?? 0.2,
    });
  }
}
