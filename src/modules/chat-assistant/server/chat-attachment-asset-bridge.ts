import { and, eq, sql } from 'drizzle-orm';
import {
  managedAttachmentRefSchema,
  type ManagedChatAttachmentRef,
} from '@prodactionpro/chat-domain';
import type {
  ChatAttachmentApplicationService,
  ConversationStore,
} from '@prodactionpro/chat-application';
import { assertChatResourceAccess, type ChatPrincipal } from '@prodactionpro/chat-server-core';
import {
  getMaxImageUploadBytes,
  uploadImageAsset,
} from '@/entities/asset/server/asset-service';
import type { AssetRecord as GraphAssetRecord } from '@/entities/production-graph/model/types';
import { getDb } from '@/shared/db/client';
import { asset } from '@/shared/db/schema/asset';

export interface PipelineAttachmentImport {
  attachmentId?: string;
  attachmentIndex: number;
  attachmentName?: string;
  nodeId: string;
}

export interface AttachmentMaterializationContext {
  documentId: string;
  principal: ChatPrincipal;
}

export class ChatAttachmentAssetBridge {
  private readonly conversations: ConversationStore;
  private readonly attachments: ChatAttachmentApplicationService;

  constructor(
    conversations: ConversationStore,
    attachments: ChatAttachmentApplicationService,
  ) {
    this.conversations = conversations;
    this.attachments = attachments;
  }

  async resolveLatestImports(
    conversationId: string,
    imports: readonly PipelineAttachmentImport[],
    principal: ChatPrincipal,
  ): Promise<PipelineAttachmentImport[]> {
    if (imports.length === 0) return [];
    const conversation = await this.conversations.findById(conversationId);
    if (!conversation) throw new Error('The assistant conversation was not found.');
    assertChatResourceAccess(principal, conversation);
    const references = await this.findLatestUserAttachmentReferences(conversationId);
    const selected = imports.map((item) => {
      const reference = references[item.attachmentIndex];
      if (!reference) {
        throw new Error(`Image attachment ${item.attachmentIndex + 1} was not found in the latest user message.`);
      }
      return {
        ...item,
        attachmentId: reference.attachmentId,
        attachmentName: reference.name,
      };
    });
    await this.attachments.assertReadyReferences(
      selected.map((item) => references[item.attachmentIndex]),
      principal,
    );
    return selected;
  }

  async materializeImports(
    imports: readonly PipelineAttachmentImport[],
    context: AttachmentMaterializationContext,
  ): Promise<{ assets: GraphAssetRecord[]; assetIdByNodeId: Map<string, string> }> {
    const assetByAttachmentId = new Map<string, GraphAssetRecord>();
    const assetIdByNodeId = new Map<string, string>();
    for (const item of imports) {
      if (!item.attachmentId) throw new Error('A prepared attachment reference is required.');
      let graphAsset = assetByAttachmentId.get(item.attachmentId);
      if (!graphAsset) {
        graphAsset = await this.materializeAttachment(item.attachmentId, context);
        assetByAttachmentId.set(item.attachmentId, graphAsset);
      }
      assetIdByNodeId.set(item.nodeId, graphAsset.id);
    }
    return { assets: Array.from(assetByAttachmentId.values()), assetIdByNodeId };
  }

  private async findLatestUserAttachmentReferences(conversationId: string) {
    const messages = await this.conversations.listMessages(conversationId);
    for (const message of messages.toReversed()) {
      if (message.role !== 'user') continue;
      const raw = message.metadata?.attachments;
      if (!Array.isArray(raw)) continue;
      const references = raw.flatMap((candidate): ManagedChatAttachmentRef[] => {
        const parsed = managedAttachmentRefSchema.safeParse(candidate);
        return parsed.success ? [parsed.data] : [];
      });
      if (references.length > 0) return references;
    }
    return [];
  }

  private async materializeAttachment(
    attachmentId: string,
    { documentId, principal }: AttachmentMaterializationContext,
  ): Promise<GraphAssetRecord> {
    const workspaceId = principal.tenantId;
    if (!workspaceId) throw new Error('A verified workspace is required for an attachment import.');
    const existing = await findExistingAttachmentAsset({
      attachmentId,
      documentId,
      userId: principal.userId,
      workspaceId,
    });
    if (existing) return toGraphAsset(existing);

    const [{ attachment, ref }, content] = await Promise.all([
      this.attachments.getAttachment(attachmentId, principal),
      this.attachments.getContent(attachmentId, principal),
    ]);
    if (attachment.status !== 'ready' || !ref) throw new Error('The image attachment is not ready.');
    const response = await fetch(content.url, {
      headers: content.headers,
      method: content.method,
    });
    if (!response.ok) throw new Error('The image attachment could not be read from private storage.');
    const declaredLength = Number.parseInt(response.headers.get('content-length') ?? '', 10);
    const maxBytes = getMaxImageUploadBytes();
    if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
      throw new Error('The image attachment is too large for a document asset.');
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > maxBytes) throw new Error('The image attachment is too large for a document asset.');
    const created = await uploadImageAsset({
      bytes,
      claimedContentType: attachment.mimeType ?? attachment.declaredMimeType,
      documentId,
      libraryVisible: false,
      maxBytes,
      metadata: {
        chatAttachmentId: attachment.id,
        source: 'chat-assistant-reference',
      },
      origin: 'unknown',
      originalName: attachment.name,
      userId: principal.userId,
      workspaceId,
    });
    return toGraphAsset(created);
  }
}

async function findExistingAttachmentAsset(input: {
  attachmentId: string;
  documentId: string;
  userId: string;
  workspaceId: string;
}) {
  const [record] = await getDb().select().from(asset).where(and(
    eq(asset.workspaceId, input.workspaceId),
    eq(asset.documentId, input.documentId),
    eq(asset.createdByUserId, input.userId),
    eq(asset.status, 'ready'),
    sql`${asset.metadata}->>'chatAttachmentId' = ${input.attachmentId}`,
  )).limit(1);
  return record;
}

function toGraphAsset(input: {
  contentType: string;
  createdAt: Date | string;
  height: number | null;
  id: string;
  originalName: string;
  width: number | null;
}): GraphAssetRecord {
  return {
    createdAt: input.createdAt instanceof Date ? input.createdAt.toISOString() : input.createdAt,
    height: input.height ?? undefined,
    id: input.id,
    kind: 'image',
    mimeType: input.contentType,
    name: input.originalName,
    storage: { assetId: input.id, type: 'remote' },
    width: input.width ?? undefined,
  };
}
