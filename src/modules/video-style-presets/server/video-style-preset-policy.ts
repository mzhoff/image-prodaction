export class VideoStylePresetError extends Error {
  readonly status: 404 | 409 | 422;
  constructor(message: string, status: 404 | 409 | 422) { super(message); this.status = status; }
}

/** The cover is a visual label, never an implicit generation reference. */
export function assertVideoStyleCover(workspaceId: string, cover: {
  workspaceId: string; status: string; mediaKind: string; libraryVisible: boolean;
} | undefined) {
  if (!cover || cover.workspaceId !== workspaceId || cover.status !== 'ready'
    || cover.mediaKind !== 'image' || !cover.libraryVisible) {
    throw new VideoStylePresetError('Выберите доступное изображение из Library этого пространства.', 422);
  }
}
