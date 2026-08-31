import { contextNodeHelp } from './node-help-context';
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

export const NODE_HELP_METADATA = {
  importImage: imageGenerationNodeHelp.importImage,
  textPrompt: textNodeHelp.textPrompt,
  textConcat: textNodeHelp.textConcat,
  textGeneration: textNodeHelp.textGeneration,
  textToSpeech: textNodeHelp.textToSpeech,
  textFormatter: textNodeHelp.textFormatter,
  textSplitter: textNodeHelp.textSplitter,
  pipelineInput: pipelineNodeHelp.pipelineInput,
  pipelineOutput: pipelineNodeHelp.pipelineOutput,
  structuredOutput: pipelineNodeHelp.structuredOutput,
  router: contextNodeHelp.router,
  iterator: contextNodeHelp.iterator,
  subjectBuilder: contextNodeHelp.subjectBuilder,
  locationBuilder: contextNodeHelp.locationBuilder,
  telegramPublication: publicationNodeHelp.telegramPublication,
  imageToText: imageGenerationNodeHelp.imageToText,
  qrCode: imageGenerationNodeHelp.qrCode,
  referenceComposer: imageGenerationNodeHelp.referenceComposer,
  composition: imageGenerationNodeHelp.composition,
  generateImage: imageGenerationNodeHelp.generateImage,
  sketch: imageGenerationNodeHelp.sketch,
  cropImage: imageEditingNodeHelp.cropImage,
  adjustment: imageEditingNodeHelp.adjustment,
  curves: imageEditingNodeHelp.curves,
  frequencyRetouch: imageEditingNodeHelp.frequencyRetouch,
  refineImage: imageEditingNodeHelp.refineImage,
  removeBackground: imageEditingNodeHelp.removeBackground,
  exportImage: imageEditingNodeHelp.exportImage,
  banner: imageEditingNodeHelp.banner,
  preview: imageEditingNodeHelp.preview,
} satisfies Record<ProductionNodeType, ProductionNodeHelp>;

export function buildNodeAskAiDraft(type: ProductionNodeType) {
  const menuLabel = getNodeDefinition(type).menuLabel;
  return `Расскажи, что такое нода «${menuLabel}» (тип ${type}) в Image Production, для чего она нужна и когда её использовать. Объясни её входы, выходы и ключевые настройки, перечисли возможности и ограничения, затем приведи короткий пример связки с другими нодами. Используй актуальный node_catalog. Ничего не изменяй в текущем документе — нужен только ответ.`;
}
