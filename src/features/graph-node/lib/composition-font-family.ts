export const COMPOSITION_FONT_ONEST = 'Onest';

const onestFallback = '"Onest", Inter, Arial, sans-serif';

interface CompositionFontVariables {
  onest?: string;
}

export function getCompositionCssFontFamily(fontFamily: string) {
  if (fontFamily === COMPOSITION_FONT_ONEST) return `var(--font-onest), ${onestFallback}`;
  return fontFamily;
}

export function getCompositionCanvasFontFamily(fontFamily: string, variables: CompositionFontVariables = {}) {
  if (fontFamily === COMPOSITION_FONT_ONEST) {
    const resolvedOnest = variables.onest?.trim();
    return resolvedOnest ? `${resolvedOnest}, ${onestFallback}` : onestFallback;
  }
  return fontFamily;
}
