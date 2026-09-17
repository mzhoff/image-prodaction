import {
  AudioLines, Blend, Bot, Brush, Clapperboard, Crop, Download, Eraser, Eye, FileInput,
  FileJson, FileOutput, Film, Fingerprint, GalleryVerticalEnd, ImagePlus, Layers, ListPlus, MapPin,
  Mic, PanelsTopLeft, PencilLine, QrCode, Repeat2, Route, Scan, Scissors,
  Send, SlidersHorizontal, Text, TextCursorInput, TrendingUp, Upload, Volume2,
  WandSparkles, type PlatformIcon, type PlatformIconProps,
} from '@prodactionpro/ui-core/icons';
import { createElement } from 'react';
import type { ProductionNodeType } from '../model/types';

// One semantic identity per node type, shared by titles, menus and the palette.
// Keep this exhaustive. Tests also compare SVG geometry: different export names
// from the icon facade can still be aliases of the same underlying glyph.
export const NODE_ICONS = {
  importImage: Upload,
  textPrompt: TextCursorInput,
  textConcat: ListPlus,
  textGeneration: Bot,
  textToSpeech: Volume2,
  speechToText: Mic,
  audioConvert: AudioLines,
  timelineHandoff: Film,
  reverieStories: GalleryVerticalEnd,
  generateVideo: Clapperboard,
  textFormatter: Text,
  textSplitter: Scissors,
  pipelineInput: FileInput,
  pipelineOutput: FileOutput,
  structuredOutput: FileJson,
  router: Route,
  iterator: Repeat2,
  subjectBuilder: Fingerprint,
  locationBuilder: MapPin,
  telegramPublication: Send,
  imageToText: Scan,
  qrCode: QrCode,
  referenceComposer: Blend,
  composition: Layers,
  generateImage: ImagePlus,
  sketch: PencilLine,
  cropImage: Crop,
  adjustment: SlidersHorizontal,
  curves: TrendingUp,
  frequencyRetouch: Brush,
  refineImage: WandSparkles,
  removeBackground: Eraser,
  exportImage: Download,
  banner: PanelsTopLeft,
  preview: Eye,
} satisfies Record<ProductionNodeType, PlatformIcon>;

export function NodeIcon({ nodeType, size = 16, ...props }: PlatformIconProps & { nodeType: ProductionNodeType }) {
  const iconProps = {
    ...props,
    size,
    'aria-hidden': true,
    focusable: false,
    'data-node-icon': nodeType,
  } satisfies PlatformIconProps & { 'data-node-icon': ProductionNodeType };
  return createElement(NODE_ICONS[nodeType], iconProps);
}
