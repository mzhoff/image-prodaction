'use client';

import { useLayoutEffect, useRef, type ReactNode } from 'react';

/** Only the upper tray changes height; the bottom-anchored prompt stays still. */
export function ComposerMaterials({ children, mode }: { children?: ReactNode; mode?: string }) {
  const tray = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const previousHeight = useRef<number | null>(null);
  const animation = useRef<Animation | null>(null);

  useLayoutEffect(() => {
    const element = tray.current;
    const inner = content.current;
    if (!mode || !element || !inner) return;
    const update = () => {
      const nextHeight = inner.getBoundingClientRect().height;
      if (nextHeight === previousHeight.current) return;
      const fromHeight = animation.current?.playState === 'running'
        ? element.getBoundingClientRect().height : previousHeight.current;
      animation.current?.cancel();
      previousHeight.current = nextHeight;
      if (fromHeight !== null && fromHeight !== nextHeight
        && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
        animation.current = element.animate(
          [{ height: `${fromHeight}px` }, { height: `${nextHeight}px` }],
          { duration: 240, easing: 'cubic-bezier(.2, .8, .2, 1)' },
        );
      }
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(inner);
    return () => { observer.disconnect(); };
  }, [mode]);

  useLayoutEffect(() => () => animation.current?.cancel(), []);
  return <div ref={tray} className="production-composer-materials">
    <div ref={content} className="production-composer-materials-content">{children}</div>
  </div>;
}
