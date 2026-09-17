import { finalizeProductionStoryDraft, requireProductionStoryDocument, storyDocumentAssets, STORY_DOCUMENT_SCHEMA_CHECKSUM } from '@/shared/contracts/stories-document';
import type { StoryDocumentV1 } from '@prodaction/stories-platform-contracts/story-document/1.0.0';
import type { PipelineNodeHandler, PipelineValue } from '../contracts/pipeline-contracts';
import { PipelineNodeHandlerError } from '../contracts/pipeline-errors';
import { assembleStoryDocument, combineStoryDocuments } from '../core/stories-assembler';
import { isPipelineArtifactReference } from '../core/pipeline-value-validation';
import { readStoryAssets, storyImageAsset, storyVideoAsset, type StoryAssetReader, type StoryStoredAsset } from './pipeline-stories-assets';

const DOCUMENT_PORTS = ['document', ...Array.from({ length: 11 }, (_, index) => `document-${index + 2}`)];
const INPUTS = new Set(['title', 'subtitle', 'text', 'image', 'video', 'poster', 'poll', 'document']);

export function createStoriesHandler(readAssets: StoryAssetReader = readStoryAssets): PipelineNodeHandler {
  return { handlerType: 'stories.assemble', handlerVersion: '1', async execute(input) {
    try {
      input.signal.throwIfAborted();
      if (input.config.documentSchemaChecksum !== STORY_DOCUMENT_SCHEMA_CHECKSUM) throw new Error('Обновите публикацию Pipeline Stories: версия контракта изменилась.');
      const sequence = input.config.storyMode === 'sequence';
      if (Object.keys(input.inputs).some((key) => sequence ? !DOCUMENT_PORTS.includes(key) : !INPUTS.has(key))) throw new Error('Проверьте подключение входов Stories.');
      const draft = input.inputs.document ?? input.config.document;
      let document: StoryDocumentV1;
      if (sequence) {
        if (input.config.document !== undefined) throw new Error('В режиме сборки подключите слайды через входы ноды.');
        document = combineStoryDocuments(DOCUMENT_PORTS.flatMap((key) => input.inputs[key] === undefined ? [] : [input.inputs[key]]),
          `story-${input.context.runId}`, `revision-${input.context.runId}`);
      } else if (draft !== undefined) {
        if (Object.keys(input.inputs).some((key) => key !== 'document')) throw new Error('Для готовой истории подключите только вход «Несколько слайдов».');
        document = input.inputs.document !== undefined
          ? requireProductionStoryDocument(draft)
          : finalizeProductionStoryDraft(draft);
      } else {
        const ids = ['image', 'video', 'poster'].flatMap((key) => {
          const value = input.inputs[key];
          if (value === undefined) return [];
          if (!isPipelineArtifactReference(value, key === 'video' ? 'video' : 'image')) throw new Error('Подключите подходящий файл к фону или постеру.');
          return [value.assetId];
        });
        const records = await loadRecords(ids);
        const image = source('image', records); const video = source('video', records); const poster = source('poster', records);
        if (video && !poster) throw new Error('Добавьте постер для видео.');
        if (poster && !video) throw new Error('Постер нужен только для видео.');
        const title = text('title', 'storyTitle');
        document = assembleStoryDocument({ id: `story-${input.context.runId}`, revisionId: `revision-${input.context.runId}`,
          locale: setting('locale'), styleProfileId: setting('styleProfileId'), styleRevisionId: setting('styleRevisionId'),
          title, subtitle: text('subtitle'), text: text('text'), poll: input.inputs.poll,
          ...(image ? { image: storyImageAsset(image, title) } : {}),
          ...(video && poster ? { video: storyVideoAsset(video, storyImageAsset(poster, title), title) } : {}) });
      }
      // Also validate every authored slide and poster against actual workspace files.
      const assets = storyDocumentAssets(document);
      const records = await loadRecords(assets.map((entry) => entry.assetId));
      for (const asset of assets) {
        const record = records.get(asset.assetId)!;
        if (asset.source.kind !== 'productionArtifact' || asset.source.checksum !== `sha256:${record.checksumSha256}`
          || asset.kind !== record.mediaKind || asset.mimeType !== record.contentType || asset.byteSize !== record.byteSize
          || asset.width !== record.width || asset.height !== record.height) throw new Error('Файл Stories изменился. Выберите его заново в редакторе.');
        if (asset.kind === 'video' && storyVideoAsset(record, asset.poster, asset.altText).durationMs !== asset.durationMs) {
          throw new Error('Длительность видео изменилась. Выберите файл заново.');
        }
      }
      input.signal.throwIfAborted();
      return { story: document as unknown as PipelineValue };

      async function loadRecords(ids: string[]) {
        const rows = await readAssets(input.context.workspaceId, [...new Set(ids)]);
        const map = new Map(rows.map((row) => [row.id, row]));
        for (const id of ids) {
          const row = map.get(id);
          if (!row || row.workspaceId !== input.context.workspaceId || row.status !== 'ready') throw new Error('Файл Stories недоступен в этом рабочем пространстве.');
        }
        return map;
      }
      function source(key: string, records: Map<string, StoryStoredAsset>) {
        const ref = input.inputs[key];
        if (!ref || !isPipelineArtifactReference(ref)) return undefined;
        const record = records.get(ref.assetId)!;
        if (ref.checksumSha256 && ref.checksumSha256 !== record.checksumSha256) throw new Error('Подключённый файл изменился.');
        return record;
      }
      function setting(key: string) { const value = input.config[key]; return typeof value === 'string' ? value : ''; }
      function text(key: string, fallback = key) {
        const value = input.inputs[key] ?? input.config[fallback] ?? '';
        if (typeof value !== 'string') throw new Error('Подключите текст к текстовому полю Stories.');
        return value;
      }
    } catch (error) {
      input.signal.throwIfAborted();
      throw new PipelineNodeHandlerError({ nodeId: input.nodeId,
        message: error instanceof Error ? error.message : 'Не удалось собрать Stories.' });
    }
  } };
}
