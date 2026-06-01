import { Crop, Download, Eye, ImagePlus, Paintbrush, Scissors, SlidersHorizontal, Sparkles, TextCursorInput, WandSparkles } from 'lucide-react';
import type { ReactNode } from 'react';
import type { ProductionNodeType } from '@/entities/production-graph/model/types';

export const addNodeMenu: Array<{ type: ProductionNodeType; label: string; icon: ReactNode }> = [
  { type: 'importImage', label: 'Import image', icon: <ImagePlus size={14} /> },
  { type: 'imageToText', label: 'Extract', icon: <WandSparkles size={14} /> },
  { type: 'textPrompt', label: 'Text prompt', icon: <TextCursorInput size={14} /> },
  { type: 'generateImage', label: 'Generate image', icon: <Sparkles size={14} /> },
  { type: 'sketch', label: 'Sketch', icon: <Paintbrush size={14} /> },
  { type: 'cropImage', label: 'Crop', icon: <Crop size={14} /> },
  { type: 'adjustment', label: 'Adjustments', icon: <SlidersHorizontal size={14} /> },
  { type: 'removeBackground', label: 'Remove BG', icon: <Scissors size={14} /> },
  { type: 'exportImage', label: 'Export image', icon: <Download size={14} /> },
  { type: 'preview', label: 'Preview', icon: <Eye size={14} /> },
];
