import { Archive, Braces, BriefcaseBusiness, Clapperboard, Download, FileText, Images, Library, MessageCircle, Newspaper, PanelsTopLeft, Send, SquarePlay, StickyNote, Volume2 } from '@prodactionpro/ui-core/icons';
import type { ReactNode } from 'react';
import { getNodeDefinition } from '@/entities/production-graph/model/node-registry';
import type { ProductionNodeType } from '@/entities/production-graph/model/types';
import { NodeIcon } from '@/entities/production-graph/ui/node-icon';
import type { ContextMenuAction } from '@/shared/ui/context-menu-types';

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
    label: 'Tools',
    icon: <Archive size={14} />,
    types: ['importImage', 'router', 'iterator', 'exportImage', 'preview'],
  },
  {
    id: 'pipeline',
    label: 'Pipeline',
    icon: <Braces size={14} />,
    types: ['pipelineInput', 'pipelineOutput', 'structuredOutput'],
  },
  {
    id: 'text',
    label: 'Text',
    icon: <FileText size={14} />,
    types: ['textPrompt', 'textConcat', 'textGeneration', 'textFormatter', 'textSplitter'],
  },
  {
    id: 'image',
    label: 'Image',
    icon: <Images size={14} />,
    types: ['generateImage', 'composition', 'qrCode', 'imageToText', 'sketch', 'cropImage', 'adjustment', 'curves', 'frequencyRetouch', 'refineImage', 'removeBackground'],
  },
  {
    id: 'sound',
    label: 'Sound',
    icon: <Volume2 size={14} />,
    types: ['textToSpeech', 'speechToText', 'audioConvert'],
  },
  {
    id: 'video',
    label: 'Video',
    icon: <Clapperboard size={14} />,
    types: [],
  },
  {
    id: 'publication',
    label: 'Publication',
    icon: <Send size={14} />,
    types: [],
  },
  {
    id: 'collaboration',
    label: 'Collaboration',
    icon: <PanelsTopLeft size={14} />,
    types: ['banner'],
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
    icon: <NodeIcon nodeType={type} size={14} />,
  };
}

function disabledPublicationItem(id: string, label: string, icon?: ReactNode): AddNodeMenuDisabledItem {
  return { id, label, icon, disabled: true };
}

function disabledVideoItem(id: string, label: string, icon?: ReactNode): AddNodeMenuDisabledItem {
  return { id, label, icon, disabled: true };
}

function disabledCollaborationItem(id: string, label: string, icon?: ReactNode): AddNodeMenuDisabledItem {
  return { id, label, icon, disabled: true };
}

const videoMenuItems: AddNodeMenuEntry[] = [
  createNodeMenuItem('generateVideo'),
  createNodeMenuItem('timelineHandoff'),
  disabledVideoItem('video-export', 'Export video', <Download size={14} />),
  disabledVideoItem('video-history', 'Video history', <Archive size={14} />),
];

const publicationMenuItems: AddNodeMenuEntry[] = [
  createNodeMenuItem('reverieStories'),
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
      disabledPublicationItem('tiktok-video', 'Video post', <Clapperboard size={14} />),
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

const collaborationMenuItems: AddNodeMenuEntry[] = [
  createNodeMenuItem('banner'),
  disabledCollaborationItem('sticky-note', 'Sticky note', <StickyNote size={14} />),
  disabledCollaborationItem('comment', 'Comment', <MessageCircle size={14} />),
];

export const addNodeMenuGroups: AddNodeMenuGroup[] = addNodeTypesByGroup.map((group) => ({
  ...group,
  items: group.id === 'publication'
    ? publicationMenuItems
    : group.id === 'video'
      ? videoMenuItems
      : group.id === 'collaboration'
        ? collaborationMenuItems
        : group.types.map(createNodeMenuItem),
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
