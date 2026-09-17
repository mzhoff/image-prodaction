'use client';

import { Loader2, Pause, Play, UserRound } from '@prodactionpro/ui-core/icons';
import { useEffect, useRef, useState } from 'react';
import { getVoiceProfile, parseVoicePreviewManifest, voiceGenderLabels, type VoiceGender, type VoicePreviewSample } from '@/shared/media/voice-preview-catalog';
import { DarkSelect } from '@/shared/ui/dark-select';
import { ProTooltip } from '@/shared/ui/pro-tooltip';
import './voice-selector.css';

let previewManifest: Promise<VoicePreviewSample[]> | undefined;
let activePreview: HTMLAudioElement | undefined;
function loadPreviewManifest() {
  return previewManifest ??= fetch('/voice-previews/manifest.json').then((response) => {
    if (!response.ok) throw new Error('Preview catalog unavailable');
    return response.json();
  }).then(parseVoicePreviewManifest).catch(() => { previewManifest = undefined; return []; });
}

export function VoiceSelector({ model, value, options, onChange }: {
  model: string; value: string; options: { value: string; label: string }[]; onChange: (voice: string) => void;
}) {
  const profile = getVoiceProfile(model, value);
  return <div className="setting-row voice-selector-row" data-node-interactive onPointerDown={(event) => event.stopPropagation()}>
    <span>Voice</span>
    <div className="voice-selector-controls">
      <DarkSelect ariaLabel="Voice" value={value} onChange={onChange} wide options={options.map((option) => {
        const item = getVoiceProfile(model, option.value);
        return { value: option.value, label: item.name, icon: <VoiceGenderIcon gender={item.gender} /> };
      })} />
      <VoicePreviewButton key={`${model}:${value}`} model={model} voice={value} language={profile.recordingLanguage} name={profile.name} direction={profile.direction} />
    </div>
  </div>;
}

function VoiceGenderIcon({ gender }: { gender: VoiceGender }) {
  const label = voiceGenderLabels[gender];
  // Match the shared 24px stroke grid; the shared package has no gender symbols yet.
  return <span className="voice-gender-icon" role="img" aria-label={label}>
    {gender === 'unknown' ? <UserRound size={14} aria-hidden="true" /> : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {gender === 'female' ? <><circle cx="12" cy="8" r="5" /><path d="M12 13v8m-4-4h8" /></> : <><circle cx="9" cy="15" r="5" /><path d="m13 11 7-7m-6 0h6v6" /></>}
    </svg>}
  </span>;
}

function VoicePreviewButton({ model, voice, language, name, direction }: {
  model: string; voice: string; language: string; name: string; direction: string;
}) {
  const [sample, setSample] = useState<VoicePreviewSample>();
  const [state, setState] = useState<'idle' | 'loading' | 'playing' | 'error'>('idle');
  const audioRef = useRef<HTMLAudioElement | undefined>(undefined);
  const attemptRef = useRef(0);
  useEffect(() => {
    let mounted = true;
    void loadPreviewManifest().then((samples) => {
      if (mounted) setSample(samples.find((item) => item.model === model && item.voice === voice && item.language === language));
    });
    return () => {
      mounted = false;
      const audio = audioRef.current;
      audioRef.current = undefined;
      if (audio) {
        audio.onplaying = audio.onpause = audio.onended = audio.onerror = null;
        audio.pause(); audio.removeAttribute('src'); audio.load();
        if (activePreview === audio) activePreview = undefined;
      }
    };
  }, [model, voice, language]);

  const toggle = async () => {
    if (!sample) return;
    const attempt = ++attemptRef.current;
    if (state === 'playing' || state === 'loading') { audioRef.current?.pause(); setState('idle'); return; }
    activePreview?.pause();
    const audio = audioRef.current ??= new Audio(sample.src);
    activePreview = audio;
    audio.onplaying = () => setState('playing');
    audio.onpause = audio.onended = () => setState('idle');
    audio.onerror = () => setState('error');
    if (state === 'error') audio.load();
    audio.currentTime = 0;
    setState('loading');
    try { await audio.play(); } catch { if (attemptRef.current === attempt && activePreview === audio && audioRef.current === audio) setState('error'); }
  };
  const label = !sample ? `${name}: образец ещё не записан. ${direction}`
    : state === 'error' ? 'Не удалось воспроизвести образец. Нажмите, чтобы повторить.'
      : `${state === 'playing' || state === 'loading' ? 'Остановить' : 'Прослушать'} образец ${name} · ${language.toUpperCase()}. ${direction}`;
  return <ProTooltip label={label}>
    <button type="button" className="voice-preview-button" aria-label={label} aria-disabled={!sample} aria-pressed={state === 'playing'} onClick={() => void toggle()}>
      {state === 'loading' ? <Loader2 size={14} className="spin" /> : state === 'playing' ? <Pause size={14} /> : <Play size={14} />}
    </button>
  </ProTooltip>;
}
