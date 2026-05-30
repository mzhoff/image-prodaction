import { Download, ImagePlus, Sparkles, TextCursorInput, WandSparkles } from 'lucide-react';
import type { ReactNode } from 'react';
import type { ProductionNodeType } from '@/entities/production-graph/model/types';

export const addNodeMenu: Array<{ type: ProductionNodeType; label: string; icon: ReactNode }> = [
  { type: 'importImage', label: 'Import image', icon: <ImagePlus size={14} /> },
  { type: 'imageToText', label: 'Extract', icon: <WandSparkles size={14} /> },
  { type: 'textPrompt', label: 'Text prompt', icon: <TextCursorInput size={14} /> },
  { type: 'generateImage', label: 'Generate image', icon: <Sparkles size={14} /> },
  { type: 'exportImage', label: 'Export image', icon: <Download size={14} /> },
];
