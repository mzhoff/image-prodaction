import { ProjectContainerPage } from '@/pages/workspace/ui/project-container-page';

export default async function FolderPage({ params }: { params: Promise<{ folderId: string }> }) {
  return <ProjectContainerPage folderId={(await params).folderId} />;
}
