import { Archive, BriefcaseBusiness, Clapperboard, Crop, Download, Eye, FileText, Fingerprint, ImagePlus, Images, Library, MapPin, MessageCircle, Newspaper, Paintbrush, PanelsTopLeft, Repeat2, Scissors, Send, SlidersHorizontal, Sparkles, SquarePlay, TextCursorInput, WandSparkles } from 'lucide-react';
import type { ReactNode } from 'react';
import { getNodeDefinition } from '@/entities/production-graph/model/node-registry';
import type { ProductionNodeType } from '@/entities/production-graph/model/types';
import type { ContextMenuAction } from '@/shared/ui/context-menu-types';

const nodeMenuIcons: Record<ProductionNodeType, ReactNode> = {
  importImage: <ImagePlus size={14} />,
  imageToText: <WandSparkles size={14} />,
  textPrompt: <TextCursorInput size={14} />,
  textConcat: <TextCursorInput size={14} />,
  textGeneration: <Sparkles size={14} />,
  textSplitter: <TextCursorInput size={14} />,
  iterator: <Repeat2 size={14} />,
  subjectBuilder: <Fingerprint size={14} />,
  locationBuilder: <MapPin size={14} />,
  telegramPublication: <Send size={14} />,
  referenceComposer: <Sparkles size={14} />,
  generateImage: <Sparkles size={14} />,
  sketch: <Paintbrush size={14} />,
  cropImage: <Crop size={14} />,
  adjustment: <SlidersHorizontal size={14} />,
  curves: <SlidersHorizontal size={14} />,
  frequencyRetouch: <Paintbrush size={14} />,
  refineImage: <WandSparkles size={14} />,
  removeBackground: <Scissors size={14} />,
  exportImage: <Download size={14} />,
  preview: <Eye size={14} />,
};

export interface AddNodeMenuItem {
  type: ProductionNodeType;
  label: string;
  icon: ReactNode;
}

export interface AddNodeMenuDisabledItem {
  id: string;
  label: string;
  icon?: ReactNode;
  disabled: true;
}

export interface AddNodeMenuSubmenu {
  id: string;
  label: string;
  icon: ReactNode;
  items: AddNodeMenuEntry[];
  disabled?: boolean;
}

export type AddNodeMenuEntry = AddNodeMenuItem | AddNodeMenuDisabledItem | AddNodeMenuSubmenu;

export interface AddNodeMenuGroup {
  id: string;
  label: string;
  icon: ReactNode;
  items: AddNodeMenuEntry[];
}

const addNodeTypesByGroup: Array<Omit<AddNodeMenuGroup, 'items'> & { types: ProductionNodeType[] }> = [
  {
    id: 'general',
    label: 'Import / Export',
    icon: <Archive size={14} />,
    types: ['importImage', 'iterator', 'exportImage', 'preview'],
  },
  {
    id: 'text',
    label: 'Text',
    icon: <FileText size={14} />,
    types: ['textPrompt', 'textConcat', 'textGeneration', 'textSplitter'],
  },
  {
    id: 'publication',
    label: 'Publication',
    icon: <Send size={14} />,
    types: [],
  },
  {
    id: 'image',
    label: 'Image',
    icon: <Images size={14} />,
    types: ['generateImage', 'imageToText', 'sketch', 'cropImage', 'adjustment', 'curves', 'frequencyRetouch', 'refineImage', 'removeBackground'],
  },
  {
    id: 'library',
    label: 'Library',
    icon: <Library size={14} />,
    types: ['subjectBuilder', 'locationBuilder'],
  },
];

function createNodeMenuItem(type: ProductionNodeType): AddNodeMenuItem {
  return {
    type,
    label: getNodeDefinition(type).menuLabel,
    icon: nodeMenuIcons[type],
  };
}

function disabledPublicationItem(id: string, label: string, icon?: ReactNode): AddNodeMenuDisabledItem {
  return { id, label, icon, disabled: true };
}

const publicationMenuItems: AddNodeMenuEntry[] = [
  {
    id: 'telegram',
    label: 'Telegram',
    icon: <Send size={14} />,
    items: [
      createNodeMenuItem('telegramPublication'),
      disabledPublicationItem('telegram-media-album', 'Media album', <Images size={14} />),
      disabledPublicationItem('telegram-story', 'Story', <PanelsTopLeft size={14} />),
    ],
  },
  {
    id: 'dzen',
    label: 'Dzen',
    icon: <Newspaper size={14} />,
    items: [
      disabledPublicationItem('dzen-article', 'Article', <FileText size={14} />),
      disabledPublicationItem('dzen-post', 'Post', <MessageCircle size={14} />),
    ],
  },
  {
    id: 'vc',
    label: 'VC',
    icon: <BriefcaseBusiness size={14} />,
    items: [
      disabledPublicationItem('vc-article', 'Article', <FileText size={14} />),
      disabledPublicationItem('vc-case', 'Case', <Newspaper size={14} />),
    ],
  },
  {
    id: 'vk',
    label: 'VK',
    icon: <MessageCircle size={14} />,
    items: [
      disabledPublicationItem('vk-post', 'Post', <MessageCircle size={14} />),
      disabledPublicationItem('vk-article', 'Article', <FileText size={14} />),
      disabledPublicationItem('vk-clip', 'Clip', <SquarePlay size={14} />),
    ],
  },
  {
    id: 'instagram',
    label: 'Instagram',
    icon: <Images size={14} />,
    items: [
      disabledPublicationItem('instagram-post', 'Post', <MessageCircle size={14} />),
      disabledPublicationItem('instagram-stories', 'Stories', <PanelsTopLeft size={14} />),
      disabledPublicationItem('instagram-reels', 'Reels', <Clapperboard size={14} />),
      disabledPublicationItem('instagram-carousel', 'Carousel', <Images size={14} />),
    ],
  },
  {
    id: 'tiktok',
    label: 'TikTok',
    icon: <Clapperboard size={14} />,
    items: [
      disabledPublicationItem('tiktok-video', 'Video post', <VideoPlaceholderIcon />),
      disabledPublicationItem('tiktok-series', 'Series item', <PanelsTopLeft size={14} />),
    ],
  },
  {
    id: 'linkedin',
    label: 'LinkedIn',
    icon: <BriefcaseBusiness size={14} />,
    items: [
      disabledPublicationItem('linkedin-post', 'Post', <MessageCircle size={14} />),
      disabledPublicationItem('linkedin-article', 'Article', <FileText size={14} />),
      disabledPublicationItem('linkedin-document', 'Carousel document', <Images size={14} />),
    ],
  },
  {
    id: 'youtube',
    label: 'YouTube',
    icon: <SquarePlay size={14} />,
    items: [
      disabledPublicationItem('youtube-video', 'Video', <SquarePlay size={14} />),
      disabledPublicationItem('youtube-shorts', 'Shorts', <Clapperboard size={14} />),
      disabledPublicationItem('youtube-community', 'Community post', <MessageCircle size={14} />),
    ],
  },
];

export const addNodeMenuGroups: AddNodeMenuGroup[] = addNodeTypesByGroup.map((group) => ({
  ...group,
  items: group.id === 'publication' ? publicationMenuItems : group.types.map(createNodeMenuItem),
}));

export const addNodeMenu: AddNodeMenuItem[] = addNodeMenuGroups.flatMap((group) => getEnabledNodeMenuItems(group.items));

export function createAddNodeContextMenuActions(
  items: AddNodeMenuEntry[],
  onCreate: (type: ProductionNodeType) => void,
): ContextMenuAction[] {
  return items.map((item) => {
    if ('items' in item) {
      return {
        id: `add-submenu-${item.id}`,
        kind: 'submenu' as const,
        label: item.label,
        icon: item.icon,
        disabled: item.disabled,
        actions: createAddNodeContextMenuActions(item.items, onCreate),
      };
    }

    if ('type' in item) {
      return {
        id: `add-${item.type}`,
        label: item.label,
        icon: item.icon,
        onSelect: () => onCreate(item.type),
      };
    }

    return {
      id: `add-disabled-${item.id}`,
      label: item.label,
      icon: item.icon,
      disabled: true,
      onSelect: () => undefined,
    };
  });
}

function getEnabledNodeMenuItems(items: AddNodeMenuEntry[]): AddNodeMenuItem[] {
  return items.flatMap((item): AddNodeMenuItem[] => {
    if ('items' in item) return getEnabledNodeMenuItems(item.items);
    if ('type' in item) return [item];
    return [];
  });
}

function VideoPlaceholderIcon() {
  return <Clapperboard size={14} />;
}
