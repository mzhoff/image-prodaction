// Exported from the approved Figma navigation, kept as masks for both themes.
export type NavigationIconName = 'home' | 'flows' | 'library' | 'stories' | 'community'
  | 'usage' | 'settings' | 'search' | 'sort' | 'plus' | 'chevrons' | 'collapse';

export function NavigationIcon({ name }: { name: NavigationIconName }) {
  return <span aria-hidden="true" className="production-navigation-glyph"
    style={{ maskImage: `url(/navigation/${name}.svg)` }} />;
}
