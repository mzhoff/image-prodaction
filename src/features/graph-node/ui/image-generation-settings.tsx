'use client';
import { useTranslations } from '@/shared/i18n/use-translations';
import { imageEnum, type ImageModelCapabilities } from '@/shared/api/image-model-capabilities';
import type { ImageGenerationOptions } from '@/shared/media/image-generation-settings';
import { SettingRow } from '@/shared/ui/setting-row';

export function ImageGenerationSettings({ capabilities, value, onChange }: {
  capabilities: ImageModelCapabilities;
  value: ImageGenerationOptions;
  onChange: (settings: Partial<ImageGenerationOptions>) => void;
}) {
  const tUi = useTranslations();
  const parameters = capabilities.parameters;
  const fields = [
    ['quality', 'imageQuality', 'Quality'],
    ['background', 'imageBackground', 'Background'],
    ['output_format', 'imageFormat', 'Format'],
  ] as const;
  const compression = parameters.output_compression;
  return <>
    {fields.map(([parameter, field, label]) => {
      const values = imageEnum(parameters, parameter).filter((item) => parameter !== 'output_format' || ['png', 'jpeg', 'webp'].includes(item));
      if (!values.length) return null;
      return <SettingRow key={field} label={label} ariaLabel={`Image ${label.toLowerCase()}`} value={value[field] ?? ''}
        options={[{ value: '', label: tUi("По умолчанию") }, ...values.map((item) => ({ value: item, label: item }))]}
        onChange={(item) => onChange({ [field]: item || undefined, ...(field === 'imageFormat' ? { imageCompression: undefined } : {}) })} />;
    })}
    {compression?.type === 'range' && value.imageFormat && ['jpeg', 'webp'].includes(value.imageFormat)
      ? <label className="setting-row"><span>Compression</span><input className="image-generation-number" type="number" min={compression.min} max={compression.max} step={1}
        placeholder={tUi("По умолчанию")} aria-label="Image compression" value={value.imageCompression ?? ''}
        onChange={(event) => onChange({ imageCompression: event.target.value === '' ? undefined : Number(event.target.value) })} /></label> : null}
    {parameters.seed?.type === 'boolean' ? <label className="setting-row"><span>Seed</span><input className="image-generation-number" type="number" min={0} max={2147483647} step={1}
      placeholder={tUi("Случайный")} aria-label="Image seed" value={value.imageSeed ?? ''}
      onChange={(event) => onChange({ imageSeed: event.target.value === '' ? undefined : Number(event.target.value) })} /></label> : null}
    <div className="node-note node-note-compact">{capabilities.maxReferences === 0
      ? tUi("Эта модель работает только с текстом, без картинок-референсов.")
      : tUi("Референсы: {p1}–{p2}. Одна картинка за запуск.", { p1: capabilities.minReferences, p2: capabilities.maxReferences })}</div>
  </>;
}
