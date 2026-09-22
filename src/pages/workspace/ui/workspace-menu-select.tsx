'use client';

import { useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Plus, Settings } from '@prodactionpro/ui-core/icons';
import { Select, SelectContent, SelectItem, SelectLabel, SelectGroup, SelectSeparator, SelectTrigger, SelectValue } from '@prodactionpro/ui-core/select';
import { useInterfaceLocale } from '@/shared/i18n/interface-locale';
import { workspaceSwitchDestination } from '../model/workspace-switch-destination';
import { useWorkspaceShell } from './workspace-shell-context';
import '@/shared/ui/filter-select.css';

const SETTINGS_VALUE = '__workspace_settings__';
const CREATE_VALUE = '__new_workspace__';

export function WorkspaceMenuSelect({ onClose, onCreate }: { onClose: () => void; onCreate: () => void }) {
  const workspace = useWorkspaceShell();
  const { text } = useInterfaceLocale();
  const router = useRouter(), pathname = usePathname();
  const [trigger, setTrigger] = useState<HTMLButtonElement | null>(null);
  const [open, setOpen] = useState(false);
  const focusCreate = useRef(false);
  const name = workspace.activeWorkspace?.name ?? (!workspace.hydrated
    ? text('Загрузка…', 'Loading…') : text('Рабочее пространство', 'Workspace'));

  return <Select value={workspace.activeWorkspace?.id ?? ''} open={open} onOpenChange={setOpen}
    disabled={!workspace.hydrated} onValueChange={(id) => {
      if (id === CREATE_VALUE) { focusCreate.current = true; setOpen(false); onCreate(); return; }
      if (id === SETTINGS_VALUE) router.push('/settings/providers');
      else if (id !== workspace.activeWorkspace?.id) {
        workspace.selectWorkspace(id);
        router.push(workspaceSwitchDestination(pathname));
      }
      onClose();
    }}>
    <SelectTrigger ref={setTrigger} className="production-workspace-select"
      aria-label={text('Выбрать рабочее пространство', 'Choose workspace')} title={name}>
      <SelectValue><span className="production-workspace-select-current">
        <span className="production-workspace-select-avatar" aria-hidden="true">{name.slice(0, 1).toLocaleUpperCase()}</span>
        <span className="production-workspace-select-name">{name}</span>
      </span></SelectValue>
    </SelectTrigger>
    <SelectContent className="production-filter-menu production-workspace-select-menu" position="popper" align="start" sideOffset={10} collisionPadding={12}
      portalContainer={trigger?.closest('dialog')} collisionBoundary={trigger?.closest('dialog')}
      onCloseAutoFocus={(event) => { if (focusCreate.current) { event.preventDefault(); focusCreate.current = false; } }}
      onEscapeKeyDown={(event) => { event.preventDefault(); setOpen(false); }}>
      <SelectGroup><SelectLabel>{text('Рабочие пространства', 'Workspaces')}</SelectLabel>
        {workspace.workspaces.map((item) => <SelectItem key={item.id} value={item.id} textValue={item.name}>
          <span className="production-workspace-select-option"><span className="production-workspace-avatar" aria-hidden="true">{item.name.slice(0, 1).toLocaleUpperCase()}</span><span>{item.name}</span></span>
        </SelectItem>)}
        {!workspace.workspaces.length ? <SelectLabel>{workspace.error || text('Нет доступных пространств', 'No workspaces found')}</SelectLabel> : null}
      </SelectGroup>
      <SelectSeparator />
      <SelectItem value={CREATE_VALUE}><span className="production-workspace-select-option"><Plus size={16} />{text('Новое пространство', 'New workspace')}</span></SelectItem>
      <SelectItem value={SETTINGS_VALUE}><span className="production-workspace-select-option"><Settings size={16} />{text('Настройки пространства', 'Workspace settings')}</span></SelectItem>
    </SelectContent>
  </Select>;
}
