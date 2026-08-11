export const CHAT_ASSISTANT_PRODUCT_ID = 'image-production';
export const CHAT_ASSISTANT_MODE = 'knowledge-base' as const;
export const CHAT_ASSISTANT_DEFAULT_MODEL = 'openai/gpt-5.4-nano';

export interface PublicChatAssistantConfig {
  enabled: boolean;
  missingSettings: string[];
  mode: typeof CHAT_ASSISTANT_MODE;
  model: string;
}
