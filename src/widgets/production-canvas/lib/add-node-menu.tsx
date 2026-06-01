import { Crop, Download, Eye, ImagePlus, Paintbrush, Scissors, SlidersHorizontal, Sparkles, TextCursorInput, WandSparkles } from 'lucide-react';
import type { ReactNode } from 'react';
import { PRODUCTION_NODE_TYPES, getNodeDefinition } from '@/entities/production-graph/model/node-registry';
import type { ProductionNodeType } from '@/entities/production-graph/model/types';

const nodeMenuIcons: Record<ProductionNodeType, ReactNode> = {
  importImage: <ImagePlus size={14} />,
  imageToText: <WandSparkles size={14} />,
  textPrompt: <TextCursorInput size={14} />,
  referenceComposer: <Sparkles size={14} />,
  generateImage: <Sparkles size={14} />,
  sketch: <Paintbrush size={14} />,
  cropImage: <Crop size={14} />,
  adjustment: <SlidersHorizontal size={14} />,
  refineImage: <WandSparkles size={14} />,
  removeBackground: <Scissors size={14} />,
  exportImage: <Download size={14} />,
  preview: <Eye size={14} />,
};

export const addNodeMenu: Array<{ type: ProductionNodeType; label: string; icon: ReactNode }> = PRODUCTION_NODE_TYPES
  .filter((type) => type !== 'referenceComposer')
  .map((type) => ({
    type,
    label: getNodeDefinition(type).menuLabel,
    icon: nodeMenuIcons[type],
  }));
