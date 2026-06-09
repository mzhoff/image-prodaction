import { z } from 'zod';
import {
  getTelegramBotInfo,
  getTelegramChat,
  getTelegramChatMember,
  getTelegramChatMemberCount,
  normalizeChatId,
  type TelegramVerifyChannelResponse,
} from './telegram-bot';

export const runtime = 'nodejs';

const verifyChannelSchema = z.object({
  channel: z.string().min(1),
});

export async function POST(request: Request) {
  let payload: z.infer<typeof verifyChannelSchema>;
  try {
    payload = verifyChannelSchema.parse(await request.json()) as z.infer<typeof verifyChannelSchema>;
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Invalid request' }, { status: 400 });
  }

  const chatId = normalizeChatId(payload.channel);

  try {
    const chatResult = await getTelegramChat(chatId);
    if (!chatResult.ok || !chatResult.result) {
      throw new Error(chatResult.result ? 'Unable to verify chat details.' : 'Telegram chat was not found.');
    }

    const botInfoResult = await getTelegramBotInfo();
    if (!botInfoResult.ok || !botInfoResult.result) {
      throw new Error('Bot info is unavailable. Check TELEGRAM_BOT_TOKEN.');
    }

    const memberCountResult = await getTelegramChatMemberCount(chatId);
    if (!memberCountResult.ok || typeof memberCountResult.result !== 'number') {
      throw new Error('Failed to fetch Telegram chat member count.');
    }

    let botIsAdmin = false;
    if (botInfoResult.result.id) {
      const memberResult = await getTelegramChatMember(chatId, botInfoResult.result.id);
      botIsAdmin = memberResult.result?.status === 'administrator' || memberResult.result?.status === 'creator';
    }

    const response: TelegramVerifyChannelResponse = {
      chatId,
      title: chatResult.result?.title ?? chatResult.result?.first_name ?? chatId,
      type: chatResult.result?.type ?? 'private',
      username: chatResult.result?.username ?? null,
      membersCount: memberCountResult.result,
      botIsAdmin,
    };

    return Response.json(response);
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Telegram channel verification failed' }, { status: 400 });
  }
}
