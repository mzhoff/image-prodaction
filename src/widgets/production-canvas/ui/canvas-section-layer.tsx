import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from 'react';
import { sortSectionsForRender } from '@/entities/production-graph/model/graph-section-layout';
import type { GraphSection } from '@/entities/production-graph/model/types';
import { cn } from '@/shared/lib/cn';
import type { SectionResizeHandle } from '../model/use-section-resize';

interface CanvasSectionLayerProps {
  disabled?: boolean;
  onRenameSection: (sectionId: string, title: string) => void;
  onSectionContextMenu: (section: GraphSection, event: ReactMouseEvent) => void;
  onSelectSection: (sectionId: string, additive?: boolean) => void;
  onStartDrag: (section: GraphSection, event: ReactPointerEvent<HTMLElement>) => void;
  onStartResize: (section: GraphSection, handle: SectionResizeHandle, event: ReactPointerEvent<HTMLElement>) => void;
  sectionColorPreviews?: Record<string, string>;
  sections: GraphSection[];
  selectedSectionSet: Set<string>;
}

export function CanvasSectionLayer({
  disabled,
  onRenameSection,
  onSectionContextMenu,
  onSelectSection,
  onStartDrag,
  onStartResize,
  sectionColorPreviews,
  sections,
  selectedSectionSet,
}: CanvasSectionLayerProps) {
  const renderSections = sortSectionsForRender(sections);

  return (
    <div className={cn('canvas-section-layer', disabled && 'canvas-section-layer-disabled')}>
      {renderSections.map((section) => (
        <CanvasSection
          key={section.id}
          section={section}
          previewColor={sectionColorPreviews?.[section.id]}
          selected={selectedSectionSet.has(section.id)}
          onRenameSection={onRenameSection}
          onSectionContextMenu={onSectionContextMenu}
          onSelectSection={onSelectSection}
          onStartDrag={onStartDrag}
          onStartResize={onStartResize}
        />
      ))}
    </div>
  );
}

function CanvasSection({
  onRenameSection,
  onSectionContextMenu,
  onSelectSection,
  onStartDrag,
  onStartResize,
  section,
  previewColor,
  selected,
}: {
  onRenameSection: (sectionId: string, title: string) => void;
  onSectionContextMenu: (section: GraphSection, event: ReactMouseEvent) => void;
  onSelectSection: (sectionId: string, additive?: boolean) => void;
  onStartDrag: (section: GraphSection, event: ReactPointerEvent<HTMLElement>) => void;
  onStartResize: (section: GraphSection, handle: SectionResizeHandle, event: ReactPointerEvent<HTMLElement>) => void;
  section: GraphSection;
  previewColor?: string;
  selected: boolean;
}) {
  const cancelEditRef = useRef(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const pointerDownRef = useRef<{ selected: boolean; x: number; y: number } | null>(null);
  const [draftTitle, setDraftTitle] = useState(section.title);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    if (!editing) setDraftTitle(section.title);
  }, [editing, section.title]);

  useEffect(() => {
    if (!editing) return;
    window.requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
  }, [editing]);

  const commitTitle = () => {
    if (cancelEditRef.current) {
      cancelEditRef.current = false;
      setEditing(false);
      return;
    }
    setEditing(false);
    onRenameSection(section.id, draftTitle);
  };

  return (
    <div
      className={cn('canvas-section', selected && 'canvas-section-selected', section.locked && 'canvas-section-locked')}
      data-canvas-section
      onContextMenu={(event) => onSectionContextMenu(section, event)}
      onClick={(event) => {
        event.stopPropagation();
        const pointerDown = pointerDownRef.current;
        pointerDownRef.current = null;
        const moved = pointerDown
          ? Math.hypot(event.clientX - pointerDown.x, event.clientY - pointerDown.y) > 4
          : false;
        if (moved) return;
        if (selected && !event.shiftKey) return;
        onSelectSection(section.id, event.shiftKey);
      }}
      onPointerDown={(event) => {
        pointerDownRef.current = { selected, x: event.clientX, y: event.clientY };
        if (selected && !section.locked) onStartDrag(section, event);
      }}
      style={{
        left: section.position.x,
        top: section.position.y,
        width: section.size.width,
        height: section.size.height,
        '--section-accent': previewColor ?? section.color ?? '#d9d9d9',
      } as CSSProperties}
    >
      <div
        className="canvas-section-badge"
        onDoubleClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setEditing(true);
        }}
        onPointerDown={(event) => {
          pointerDownRef.current = { selected, x: event.clientX, y: event.clientY };
          if (selected && !section.locked) onStartDrag(section, event);
        }}
      >
        {editing ? (
          <input
            ref={inputRef}
            size={Math.max(8, draftTitle.length || 8)}
            value={draftTitle}
            onBlur={commitTitle}
            onChange={(event) => setDraftTitle(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                commitTitle();
              }
              if (event.key === 'Escape') {
                event.preventDefault();
                cancelEditRef.current = true;
                setDraftTitle(section.title);
                setEditing(false);
              }
            }}
            onPointerDown={(event) => {
              event.stopPropagation();
            }}
          />
        ) : (
          section.title
        )}
      </div>
      {selected && !section.locked ? (
        <>
          {(['n', 's', 'e', 'w'] as SectionResizeHandle[]).map((handle) => (
            <button
              key={handle}
              type="button"
              aria-label={`Resize section ${handle}`}
              className={cn('canvas-section-resize-edge', `canvas-section-resize-${handle}`)}
              onPointerDown={(event) => onStartResize(section, handle, event)}
            />
          ))}
          {(['ne', 'sw', 'se'] as SectionResizeHandle[]).map((handle) => (
            <button
              key={handle}
              type="button"
              aria-label={`Resize section ${handle}`}
              className={cn('canvas-section-resize-handle', `canvas-section-resize-${handle}`)}
              onPointerDown={(event) => onStartResize(section, handle, event)}
            />
          ))}
        </>
      ) : null}
    </div>
  );
}
