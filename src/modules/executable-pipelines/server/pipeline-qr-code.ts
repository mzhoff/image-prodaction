import { createHash } from 'node:crypto';
import QRCode from 'qrcode';
import {
  getMaxImageUploadBytes,
  uploadImageAsset,
  AssetStorageError,
  type AssetDto,
  type UploadImageAssetInput,
} from '@/entities/asset/server/asset-service';
import {
  QrCodeValidationError,
  normalizeQrCodeContent,
  normalizeQrCodeOptions,
  type QrCodeOptions,
} from '@/shared/qr-code';
import type {
  PipelineArtifactReference,
  PipelineExecutionContext,
  PipelineNodeHandler,
  PipelineValue,
} from '../contracts/pipeline-contracts';
import { PipelineNodeHandlerError } from '../contracts/pipeline-errors';
import { toPipelineImageArtifact } from './pipeline-image-artifacts';
import type { PipelineHandlerScope } from './pipeline-ai-handlers';
import { readString } from './pipeline-handler-values';

export type PipelineQrPngRenderer = (input: {
  content: string;
  options: QrCodeOptions;
}) => Promise<Uint8Array>;

export type PipelineQrCodeGenerator = (input: {
  config: Record<string, PipelineValue>;
  content: string;
  context: PipelineExecutionContext;
  nodeId: string;
  options: QrCodeOptions;
  signal: AbortSignal;
}) => Promise<PipelineArtifactReference>;

type PipelineQrAssetUploader = (
  input: UploadImageAssetInput,
) => Promise<AssetDto>;

export function createQrCodePipelineHandler(
  generateQrCode: PipelineQrCodeGenerator,
): PipelineNodeHandler {
  return {
    handlerType: 'image.qr.generate',
    handlerVersion: '1',
    async execute(input) {
      try {
        const options = normalizeQrCodeOptions(input.config);
        const source = typeof input.inputs.text === 'string'
          ? input.inputs.text
          : readString(input.config.fallbackText);
        const content = normalizeQrCodeContent(source, options.contentMode);
        return {
          image: await generateQrCode({
            config: input.config,
            content,
            context: input.context,
            nodeId: input.nodeId,
            options,
            signal: input.signal,
          }),
        };
      } catch (error) {
        if (error instanceof PipelineNodeHandlerError) throw error;
        if (error instanceof QrCodeValidationError) {
          throw handlerError(error.message, input.nodeId);
        }
        if (error instanceof AssetStorageError) {
          throw handlerError('QR image storage is temporarily unavailable.', input.nodeId, true);
        }
        throw handlerError('QR code generation failed.', input.nodeId);
      }
    },
  };
}

export function createStoredQrCodeGenerator(
  scope: PipelineHandlerScope,
  dependencies: {
    renderPng?: PipelineQrPngRenderer;
    uploadAsset?: PipelineQrAssetUploader;
  } = {},
): PipelineQrCodeGenerator {
  const renderPng = dependencies.renderPng ?? renderQrCodePng;
  const uploadAsset = dependencies.uploadAsset ?? uploadImageAsset;
  return async (input) => {
    throwIfPipelineAborted(input.signal);
    const requestHash = hashQrCodeRequest(input.content, input.options);
    const bytes = await renderPng({ content: input.content, options: input.options });
    throwIfPipelineAborted(input.signal);
    const asset = await uploadAsset({
      bytes,
      claimedContentType: 'image/png',
      documentId: scope.documentId ?? null,
      libraryVisible: false,
      maxBytes: getMaxImageUploadBytes(),
      metadata: {
        format: 'png',
        pipelineId: input.context.pipelineId,
        pipelineNodeId: input.nodeId,
        pipelineRunId: input.context.runId,
        qrCode: {
          backgroundColor: input.options.backgroundColor,
          contentMode: input.options.contentMode,
          errorCorrectionLevel: input.options.errorCorrectionLevel,
          foregroundColor: input.options.foregroundColor,
          margin: input.options.margin,
          outputFormat: input.options.outputFormat,
          pixelSize: input.options.pixelSize,
          requestHash,
        },
      },
      operation: 'pipeline_qr_generate',
      origin: 'unknown',
      originalName: `qr-code-${requestHash.slice(0, 12)}.png`,
      requestedAssetId: createDeterministicQrAssetId(
        input.context.runId,
        input.nodeId,
        requestHash,
      ),
      userId: scope.actorUserId,
      workspaceId: input.context.workspaceId,
    });
    return toPipelineImageArtifact(asset, input.context.runId);
  };
}

export async function renderQrCodePng(input: {
  content: string;
  options: QrCodeOptions;
}) {
  const result = await QRCode.toBuffer(input.content, {
    color: {
      dark: input.options.foregroundColor,
      light: input.options.backgroundColor,
    },
    errorCorrectionLevel: input.options.errorCorrectionLevel,
    margin: input.options.margin,
    type: 'png',
    width: input.options.pixelSize,
  });
  return new Uint8Array(result);
}

export function hashQrCodeRequest(content: string, options: QrCodeOptions) {
  return createHash('sha256').update(JSON.stringify({
    content,
    backgroundColor: options.backgroundColor,
    contentMode: options.contentMode,
    errorCorrectionLevel: options.errorCorrectionLevel,
    foregroundColor: options.foregroundColor,
    margin: options.margin,
    outputFormat: options.outputFormat,
    pixelSize: options.pixelSize,
  })).digest('hex');
}

export function createDeterministicQrAssetId(
  runId: string,
  nodeId: string,
  requestHash: string,
) {
  const digest = createHash('sha256')
    .update('image.qr.generate@1\0')
    .update(runId)
    .update('\0')
    .update(nodeId)
    .update('\0')
    .update(requestHash)
    .digest();
  const runHex = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(runId)
    ? runId.replace(/-/g, '')
    : '';
  const bytes = Buffer.from(digest.subarray(0, 16));
  if (runHex) Buffer.from(runHex.slice(0, 12), 'hex').copy(bytes, 0, 0, 6);
  bytes[6] = 0x70 | (bytes[6]! & 0x0f);
  bytes[8] = 0x80 | (bytes[8]! & 0x3f);
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function throwIfPipelineAborted(signal: AbortSignal) {
  if (signal.aborted) throw signal.reason ?? new Error('Pipeline execution was aborted.');
}

function handlerError(message: string, nodeId: string, retryable = false) {
  return new PipelineNodeHandlerError({ message, nodeId, retryable });
}
