import type { StoryDocumentDraftV1 } from '@prodaction/stories-platform-contracts/story-document/1.0.0';
import type { StoriesAuthoringProfileBundle } from '@/shared/contracts/stories-authoring-profile';
import type { BaseNodeData } from './node-data-image';

export interface ReverieStoriesNodeData extends BaseNodeData {
  storyMode?: 'slide' | 'sequence';
  storyTitle: string;
  subtitle: string;
  text: string;
  locale: string;
  styleProfileId: string;
  styleRevisionId: string;
  document?: StoryDocumentDraftV1;
  authoringProfileBundle?: StoriesAuthoringProfileBundle;
}
