import { getChatAssistantConfig } from '@/modules/chat-assistant/server/route-handlers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const GET = getChatAssistantConfig;
