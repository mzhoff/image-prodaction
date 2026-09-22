import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const styles = [
  require.resolve('@prodactionpro/ui-tokens/css/reverie.css'),
  'src/app/styles/reverie-theme.css',
  'src/app/styles/aspect-ratio-selector.css',
  'src/app/styles/auth.css',
  'src/features/graph-node/ui/nodes/generate-video-node.css',
  'src/features/graph-node/ui/timeline-media.css',
  'src/features/graph-node/ui/voice-selector.css',
].map((path) => readFileSync(path, 'utf8')).join('\n');

// Frozen pre-release declarations: package compatibility must preserve their
// actual browser colors, including fallbacks and inherited values.
const beforeRelease = `
.aspect-ratio-resolution { color: var(--pui-semantic-text-tertiary, #a6a6a6); }
.auth-theme-switch button:focus-visible { outline: 2px solid var(--pui-semantic-accent-primary); }
.video-generation-placeholder { color: var(--pui-semantic-text-tertiary); }
.timeline-editor-clock strong span, .timeline-editor-clock small { color: var(--pui-semantic-text-tertiary, var(--pui-semantic-text-secondary)); }
.voice-preview-button[aria-pressed="true"] { color: var(--pui-semantic-text-accent, #204aff); }
`;

for (const theme of ['light', 'dark']) {
  test(`package token cleanup preserves Production colors in ${theme} theme`, async ({ page }) => {
    await page.setContent(`
      <html data-theme="${theme}"><head><style>${styles}</style></head>
      <body style="color:var(--pui-semantic-text-primary)">
        <span data-probe class="aspect-ratio-resolution">1920 × 1080</span>
        <div class="auth-theme-switch"><button data-probe type="button">Theme</button></div>
        <div style="position:relative;height:40px"><span data-probe class="video-generation-placeholder">Video</span></div>
        <div class="timeline-editor-clock"><strong><span data-probe>00:00</span></strong><small data-probe>30 sec</small></div>
        <button data-probe class="voice-preview-button" aria-pressed="true">Voice</button>
      </body></html>
    `);
    await page.locator('.auth-theme-switch button').focus();
    const values = () => page.locator('[data-probe]').evaluateAll((elements) => elements.map((element) => {
      const style = getComputedStyle(element);
      return {
        color: style.color,
        background: style.backgroundColor,
        opacity: style.opacity,
        outline: style.outline,
        outlineOffset: style.outlineOffset,
        boxShadow: style.boxShadow,
      };
    }));
    const oldStyle = await page.addStyleTag({ content: beforeRelease });
    const before = await values();
    await oldStyle.evaluate((element) => element.parentNode?.removeChild(element));
    expect(await values()).toEqual(before);
    expect(before[0].color).toBe('rgb(166, 166, 166)');
    expect(before.at(-1)?.color).toBe('rgb(32, 74, 255)');
  });
}
