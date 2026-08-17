import type { NextAttachmentRouteContext, NextRouteContext } from '@prodactionpro/chat-runtime-next/server';
import { createRouteErrorResponse } from '@prodactionpro/chat-runtime-next/server';
import { resolveChatPrincipal } from './auth';
import { getChatAssistantComposition } from './composition';
import { readChatAssistantConfig, toPublicChatAssistantConfig } from './config';

export async function getChatAssistantConfig(request: Request) {
  try {
    await resolveChatPrincipal(request);
    return Response.json(toPublicChatAssistantConfig(readChatAssistantConfig()), {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    return createRouteErrorResponse(error);
  }
}

export const postChatTurn = (request: Request) => withComposition(
  (composition) => composition.routes.turn(request),
);

export const postChatTurnStream = (request: Request) => withComposition(
  (composition) => composition.routes.turnStream(request),
);

export const postChatTurnRetryStream = (request: Request) => withComposition(
  (composition) => composition.routes.turnRetryStream(request),
);

export const getChatConversations = (request: Request) => withComposition(
  (composition) => composition.routes.conversations(request),
);

export const getChatConversation = (request: Request, context: NextRouteContext) => withComposition(
  (composition) => composition.routes.conversation(request, context),
);

export const getChatMessages = (request: Request, context: NextRouteContext) => withComposition(
  (composition) => composition.routes.messagesGet(request, context),
);

export const postChatMessage = (request: Request, context: NextRouteContext) => withComposition(
  (composition) => composition.routes.messagesPost(request, context),
);

export const getChatEvents = (request: Request, context: NextRouteContext) => withComposition(
  (composition) => composition.routes.events(request, context),
);

export const postToolConfirmation = (request: Request, context: NextRouteContext) => withComposition(
  (composition) => composition.routes.toolConfirm(request, context),
);

export const postToolRejection = (request: Request, context: NextRouteContext) => withComposition(
  (composition) => composition.routes.toolReject(request, context),
);

export const postAttachmentPrepare = (request: Request) => withComposition(
  (composition) => composition.routes.attachmentPrepare(request),
);

export const postAttachmentComplete = (request: Request, context: NextAttachmentRouteContext) => withComposition(
  (composition) => composition.routes.attachmentComplete(request, context),
);

export const getAttachmentMetadata = (request: Request, context: NextAttachmentRouteContext) => withComposition(
  (composition) => composition.routes.attachmentMetadata(request, context),
);

export const getAttachmentContent = (request: Request, context: NextAttachmentRouteContext) => withComposition(
  (composition) => composition.routes.attachmentContent(request, context),
);

export const deleteAttachment = (request: Request, context: NextAttachmentRouteContext) => withComposition(
  (composition) => composition.routes.attachmentDelete(request, context),
);

async function withComposition(
  handler: (composition: Awaited<ReturnType<typeof getChatAssistantComposition>>) => Promise<Response>,
) {
  try {
    return await handler(await getChatAssistantComposition());
  } catch (error) {
    return createRouteErrorResponse(error);
  }
}
