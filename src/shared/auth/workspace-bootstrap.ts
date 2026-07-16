export interface PersonalWorkspaceUser {
  id: string;
  email: string;
  name: string;
}

export type PersonalWorkspaceBootstrap = (user: PersonalWorkspaceUser) => Promise<void>;

let bootstrap: PersonalWorkspaceBootstrap | undefined;

export function registerPersonalWorkspaceBootstrap(next: PersonalWorkspaceBootstrap) {
  bootstrap = next;
}

export async function bootstrapPersonalWorkspace(user: PersonalWorkspaceUser) {
  await bootstrap?.(user);
}
