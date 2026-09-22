import { TimelineEditorPage } from '@/pages/stories/ui/timeline-editor-page';
export default async function Page({ params }: { params: Promise<{ timelineId: string }> }) {
  const { timelineId } = await params;
  return <TimelineEditorPage key={timelineId} id={timelineId} />;
}
