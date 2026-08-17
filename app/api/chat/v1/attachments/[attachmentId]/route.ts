import {
  deleteAttachment,
  getAttachmentMetadata,
} from '@/modules/chat-assistant/server/route-handlers';

export const runtime = 'nodejs';
export const GET = getAttachmentMetadata;
export const DELETE = deleteAttachment;
