import { contextNodeHelp } from './node-help-context';
import { audioNodeHelp } from './node-help-audio';
import { timelineNodeHelp } from './node-help-timeline';
import { storiesNodeHelp } from './node-help-stories';
import { videoNodeHelp } from './node-help-video';
import { imageEditingNodeHelp } from './node-help-image-editing';
import { imageGenerationNodeHelp } from './node-help-image-generation';
import { pipelineNodeHelp } from './node-help-pipeline';
import { publicationNodeHelp } from './node-help-publication';
import { textNodeHelp } from './node-help-text';
import type { ProductionNodeHelp } from './node-help-types';
import { getNodeDefinition } from './node-registry';
import type { ProductionNodeType } from './types';

export type {
  ProductionNodeAvailability,
  ProductionNodeExecution,
  ProductionNodeHelp,
} from './node-help-types';


function withModelSelector(help: ProductionNodeHelp): ProductionNodeHelp {
  return { ...help, capabilities: [...help.capabilities,
    'Селектор модели: All сортирует A–Z, Most popular — по числу успешных заданий этого аккаунта за всё время, Favorite — в порядке добавления или ручной сортировки. Ретраи одного задания не увеличивают популярность; сервисные интеграции не входят в личную статистику.',
    'Поиск работает во всех вкладках. Звёздочка при наведении или фокусе добавляет и удаляет избранное, не выбирая модель. Вкладка и избранное запоминаются в аккаунте отдельно для текста, изображений, видео и аудио и общие для нод одного типа во всех Workspace. Порядок избранного можно менять в Настройки → Аккаунт → Избранные модели.',
  ], limitations: [...help.limitations,
    'Auto Router исключён: выберите конкретную совместимую модель. Избранное не расширяет возможности ноды и не меняет model автоматически. Личные вкладки, избранное и популярность не являются settings ноды, не экспортируются в pipeline и не управляются через MCP.',
  ] };
}

export const NODE_HELP_METADATA = {
  importImage: imageGenerationNodeHelp.importImage,
  textPrompt: textNodeHelp.textPrompt,
  textConcat: textNodeHelp.textConcat,
  textGeneration: withModelSelector(textNodeHelp.textGeneration),
  textToSpeech: withModelSelector(audioNodeHelp.textToSpeech),
  speechToText: withModelSelector(audioNodeHelp.speechToText),
  audioConvert: audioNodeHelp.audioConvert,
  timelineHandoff: timelineNodeHelp.timelineHandoff,
  reverieStories: storiesNodeHelp.reverieStories,
  generateVideo: withModelSelector(videoNodeHelp.generateVideo),
  textFormatter: textNodeHelp.textFormatter,
  textSplitter: textNodeHelp.textSplitter,
  pipelineInput: pipelineNodeHelp.pipelineInput,
  pipelineOutput: pipelineNodeHelp.pipelineOutput,
  structuredOutput: pipelineNodeHelp.structuredOutput,
  router: contextNodeHelp.router,
  iterator: contextNodeHelp.iterator,
  subjectBuilder: withModelSelector(contextNodeHelp.subjectBuilder),
  locationBuilder: contextNodeHelp.locationBuilder,
  telegramPublication: publicationNodeHelp.telegramPublication,
  imageToText: withModelSelector(imageGenerationNodeHelp.imageToText),
  qrCode: imageGenerationNodeHelp.qrCode,
  referenceComposer: withModelSelector(imageGenerationNodeHelp.referenceComposer),
  composition: imageGenerationNodeHelp.composition,
  generateImage: withModelSelector(imageGenerationNodeHelp.generateImage),
  sketch: imageGenerationNodeHelp.sketch,
  cropImage: imageEditingNodeHelp.cropImage,
  adjustment: imageEditingNodeHelp.adjustment,
  curves: imageEditingNodeHelp.curves,
  frequencyRetouch: imageEditingNodeHelp.frequencyRetouch,
  refineImage: withModelSelector(imageEditingNodeHelp.refineImage),
  removeBackground: imageEditingNodeHelp.removeBackground,
  exportImage: imageEditingNodeHelp.exportImage,
  banner: imageEditingNodeHelp.banner,
  preview: imageEditingNodeHelp.preview,
} satisfies Record<ProductionNodeType, ProductionNodeHelp>;

export function buildNodeAskAiDraft(type: ProductionNodeType) {
  const menuLabel = getNodeDefinition(type).menuLabel;
  return `Расскажи, что такое нода «${menuLabel}» (тип ${type}) в Image Production, для чего она нужна и когда её использовать. Объясни её входы, выходы и ключевые настройки, перечисли возможности и ограничения, затем приведи короткий пример связки с другими нодами. Используй актуальный node_catalog. Ничего не изменяй в текущем документе — нужен только ответ.`;
}
