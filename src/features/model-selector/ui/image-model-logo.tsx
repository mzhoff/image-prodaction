const LOGOS: Record<string, string> = {
  openrouter: 'openrouter', openai: 'openai', google: 'google', microsoft: 'microsoft',
  meta: 'meta', recraft: 'recraft', 'bytedance-seed': 'bytedance', qwen: 'qwen',
  krea: 'krea', 'black-forest-labs': 'flux', 'x-ai': 'grok', sourceful: 'sourceful',
  anthropic: 'claude', deepgram: 'deepgram', 'fish-audio': 'fishaudio', minimax: 'minimax',
  canopylabs: 'canopylabs', sesame: 'sesame', hexgrad: 'hexgrad.png',
  mistralai: 'mistral', elevenlabs: 'elevenlabs',
};

export function ImageModelLogo({ modelId }: { modelId: string }) {
  const publisher = modelId.split('/')[0];
  const logo = LOGOS[publisher];
  return <span className="video-model-logo" aria-hidden="true" title={publisher}>
    {logo ? <span data-model-logo={publisher} style={{ width: 16, height: 16,
      ...(logo.endsWith('.png')
        ? { background: `url(/image-model-logos/${logo}) center / contain no-repeat`, borderRadius: 3 }
        : { backgroundColor: 'currentColor', mask: `url(/image-model-logos/${logo}.svg) center / contain no-repeat` }),
    }} /> : <span className="video-model-logo-fallback">{publisher.slice(0, 1).toUpperCase()}</span>}
  </span>;
}
