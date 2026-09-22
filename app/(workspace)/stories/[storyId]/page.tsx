import { StoryEditorPage } from '@/pages/stories/ui/story-editor-page';
export default async function Page({ params }: { params: Promise<{ storyId: string }> }) {
  const { storyId } = await params;
  return <StoryEditorPage key={storyId} id={storyId} />;
}
