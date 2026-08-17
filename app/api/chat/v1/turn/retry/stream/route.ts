import { postChatTurnRetryStream } from '@/modules/chat-assistant/server/route-handlers';

export const runtime = 'nodejs';
export const POST = postChatTurnRetryStream;
