import { Buffer } from 'node:buffer';
import type {
  AttachmentObjectStorage,
  AttachmentStoredObject,
} from '@prodactionpro/chat-application';
import type { ManagedAttachment } from '@prodactionpro/chat-domain';

/**
 * Local/private-storage compatibility adapter.
 *
 * External AI providers cannot fetch URLs that only resolve on the consumer's
 * machine or private network. This adapter is attached only to the model-facing
 * application service and changes its read target to an inline data URL.
 */
export class InlineReadAttachmentObjectStorage implements AttachmentObjectStorage {
  private readonly delegate: AttachmentObjectStorage;
  private readonly maxBytes: number;

  constructor(delegate: AttachmentObjectStorage, maxBytes: number) {
    this.delegate = delegate;
    this.maxBytes = maxBytes;
  }

  createUploadTarget(input: Parameters<AttachmentObjectStorage['createUploadTarget']>[0]) {
    return this.delegate.createUploadTarget(input);
  }

  deleteObject(storageRef: string) {
    return this.delegate.deleteObject(storageRef);
  }

  getObject(storageRef: string) {
    return this.delegate.getObject(storageRef);
  }

  async createReadTarget(attachment: ManagedAttachment) {
    if ((attachment.sizeBytes ?? attachment.declaredSizeBytes) > this.maxBytes) {
      throw new Error('Attachment is too large for inline model delivery.');
    }

    const storedObject = await this.delegate.getObject(attachment.storageRef);
    const body = await readStoredObject(storedObject, this.maxBytes);
    const mimeType = attachment.mimeType ?? storedObject.contentType ?? attachment.declaredMimeType;
    if (!mimeType?.startsWith('image/')) {
      throw new Error('Inline model delivery only supports validated images.');
    }

    return {
      url: `data:${mimeType};base64,${Buffer.from(body).toString('base64')}`,
    };
  }
}

async function readStoredObject(object: AttachmentStoredObject, maxBytes: number) {
  if (object.contentLength !== undefined && object.contentLength > maxBytes) {
    throw new Error('Stored attachment exceeds the inline delivery limit.');
  }
  if (object.body instanceof Uint8Array) {
    if (object.body.byteLength > maxBytes) {
      throw new Error('Stored attachment exceeds the inline delivery limit.');
    }
    return object.body;
  }

  const chunks: Uint8Array[] = [];
  let byteLength = 0;
  for await (const chunk of object.body) {
    byteLength += chunk.byteLength;
    if (byteLength > maxBytes) {
      throw new Error('Stored attachment exceeds the inline delivery limit.');
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks, byteLength);
}
