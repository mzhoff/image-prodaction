import sharp from 'sharp';
import {
  getAssetContent,
  getMaxImageUploadBytes,
  uploadImageAsset,
} from '@/entities/asset/server/asset-service';
import type { PipelineValue } from '../contracts/pipeline-contracts';
import { PipelineNodeHandlerError } from '../contracts/pipeline-errors';
import { toPipelineImageArtifact } from './pipeline-image-artifacts';
import type {
  PipelineImageExporter,
  PipelineImageExportOptions,
  PipelineImageOperationScope,
} from './pipeline-image-contracts';
import { readString } from './pipeline-handler-values';

export function createSharpImageExporter(
  scope: PipelineImageOperationScope,
): PipelineImageExporter {
  return async (input) => {
    const options = readImageExportOptions(input.config, input.nodeId);
    const exported = [];
    for (let index = 0; index < input.artifacts.length; index += 1) {
      throwIfPipelineAborted(input.signal);
      const source = input.artifacts[index]!;
      const content = await getAssetContent(scope.actorUserId, source.assetId);
      if (content.asset.workspaceId !== input.context.workspaceId || content.asset.mediaKind !== 'image') {
        throw handlerError('Export source does not belong to the pipeline workspace.', input.nodeId);
      }
      const bytes = new Uint8Array(await new Response(content.object.body).arrayBuffer());
      let transformed: Awaited<ReturnType<typeof transformPipelineExportImage>>;
      try {
        transformed = await transformPipelineExportImage(bytes, options);
      } catch {
        throw handlerError('Image export transformation failed.', input.nodeId);
      }
      throwIfPipelineAborted(input.signal);
      const asset = await uploadImageAsset({
        bytes: transformed.bytes,
        claimedContentType: transformed.contentType,
        documentId: scope.documentId ?? null,
        libraryVisible: false,
        maxBytes: getMaxImageUploadBytes(),
        metadata: {
          export: options,
          pipelineId: input.context.pipelineId,
          pipelineNodeId: input.nodeId,
          pipelineRunId: input.context.runId,
          sourceAssetId: source.assetId,
        },
        operation: 'pipeline_image_export',
        origin: 'unknown',
        originalName: createExportFileName(
          content.asset.originalName,
          transformed.extension,
          index,
          input.artifacts.length,
        ),
        userId: scope.actorUserId,
        workspaceId: input.context.workspaceId,
      });
      exported.push(toPipelineImageArtifact(asset, input.context.runId));
    }
    return exported;
  };
}

export async function transformPipelineExportImage(
  bytes: Uint8Array,
  options: PipelineImageExportOptions,
) {
  const metadata = await sharp(bytes).rotate().metadata();
  let image = sharp(bytes).rotate();
  const scale = Number(options.scale);
  if (scale < 1 && metadata.width && metadata.height) {
    image = image.resize({
      fit: 'fill',
      height: Math.max(1, Math.round(metadata.height * scale)),
      width: Math.max(1, Math.round(metadata.width * scale)),
    });
  }
  const background = options.format === 'jpeg' && options.background === 'transparent'
    ? 'white'
    : options.background;
  if (background !== 'transparent') {
    image = image.flatten({ background: background === 'black' ? '#000000' : '#ffffff' });
  }
  const result = options.format === 'png'
    ? await image.png().toBuffer({ resolveWithObject: true })
    : options.format === 'jpeg'
      ? await image.jpeg({ quality: options.quality }).toBuffer({ resolveWithObject: true })
      : await image.webp({ quality: options.quality }).toBuffer({ resolveWithObject: true });
  return {
    bytes: new Uint8Array(result.data),
    contentType: options.format === 'jpeg' ? 'image/jpeg' : `image/${options.format}`,
    extension: options.format === 'jpeg' ? 'jpg' : options.format,
    height: result.info.height,
    width: result.info.width,
  };
}

function readImageExportOptions(
  config: Record<string, PipelineValue>,
  nodeId: string,
): PipelineImageExportOptions {
  const { format, scale, background } = config;
  if (format !== 'png' && format !== 'jpeg' && format !== 'webp') {
    throw handlerError('Image export format is invalid.', nodeId);
  }
  if (scale !== '1' && scale !== '0.75' && scale !== '0.5' && scale !== '0.25') {
    throw handlerError('Image export scale is invalid.', nodeId);
  }
  if (background !== 'transparent' && background !== 'white' && background !== 'black') {
    throw handlerError('Image export background is invalid.', nodeId);
  }
  const quality = Number.parseInt(readString(config.quality), 10);
  return {
    background,
    format,
    quality: Number.isFinite(quality) ? Math.min(100, Math.max(1, quality)) : 90,
    scale,
  };
}

function createExportFileName(sourceName: string, extension: string, index: number, total: number) {
  const baseName = sourceName.replace(/\.[^.]+$/, '')
    .replace(/[^\wа-яА-ЯёЁ-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'reverie-export';
  const prefix = total > 1 ? `${String(index + 1).padStart(String(total).length, '0')}-` : '';
  return `${prefix}${baseName}.${extension}`;
}

function throwIfPipelineAborted(signal: AbortSignal) {
  if (signal.aborted) throw signal.reason ?? new Error('Pipeline execution was aborted.');
}

function handlerError(message: string, nodeId: string) {
  return new PipelineNodeHandlerError({ message, nodeId });
}
