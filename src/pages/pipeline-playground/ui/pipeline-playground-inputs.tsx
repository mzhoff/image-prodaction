import Image from 'next/image';
import { CheckCircle2, LoaderCircle, Upload } from 'lucide-react';
import type { PipelinePlaygroundDescriptor,
  PipelinePlaygroundField } from '@/modules/executable-pipelines/contracts/pipeline-playground-contracts';
import type { PipelinePlaygroundDraft } from '../model/pipeline-playground-inputs';
import { isArtifactReference } from '../model/pipeline-playground-values';

export function PipelineSummary({ descriptor }: { descriptor: PipelinePlaygroundDescriptor }) {
  return (
    <div className="playground-pipeline-summary">
      <div>
        <CheckCircle2 size={18} />
        <div><strong>{descriptor.name}</strong><span>Executable · v{descriptor.version}</span></div>
      </div>
      <code>{descriptor.publicId}</code>
    </div>
  );
}

export function PipelineInputField({ draft, error, field, onChange, onUpload, uploading }: {
  draft: PipelinePlaygroundDraft;
  error?: string;
  field: PipelinePlaygroundField;
  onChange: (value: PipelinePlaygroundDraft) => void;
  onUpload: (files: File[]) => void;
  uploading: boolean;
}) {
  const fieldId = `playground-input-${field.name}`;
  const descriptionId = `${fieldId}-description`;
  const errorId = `${fieldId}-error`;
  const describedBy = [field.description ? descriptionId : '', error ? errorId : '']
    .filter(Boolean).join(' ') || undefined;
  return (
    <div className={`playground-field ${error ? 'playground-field-error' : ''}`}>
      <div className="playground-field-label">
        <label htmlFor={fieldId}>{field.label}</label>
        <span>{field.kind}{field.required ? ' · Required' : ' · Optional'}</span>
      </div>
      {field.description ? <p id={descriptionId}>{field.description}</p> : null}
      <InputControl describedBy={describedBy} draft={draft} field={field} fieldId={fieldId}
        onChange={onChange} onUpload={onUpload} uploading={uploading} />
      {error ? <span className="playground-field-error-text" id={errorId}>{error}</span> : null}
    </div>
  );
}

function InputControl({ describedBy, draft, field, fieldId, onChange, onUpload, uploading }: {
  describedBy?: string;
  draft: PipelinePlaygroundDraft;
  field: PipelinePlaygroundField;
  fieldId: string;
  onChange: (value: PipelinePlaygroundDraft) => void;
  onUpload: (files: File[]) => void;
  uploading: boolean;
}) {
  if (field.kind === 'image' || field.kind === 'image_collection') {
    const artifacts = Array.isArray(draft) ? draft : isArtifactReference(draft) ? [draft] : [];
    return (
      <div className="playground-upload-control">
        {artifacts.length > 0 ? (
          <div className="playground-uploaded-images">{artifacts.map((artifact) => (
            <div className="playground-uploaded-image" key={artifact.assetId}>
              <Image alt="" height={artifact.height ?? 160}
                src={`/api/assets/${encodeURIComponent(artifact.assetId)}/content`}
                unoptimized width={artifact.width ?? 240} />
              <span>{typeof artifact.originalName === 'string'
                ? artifact.originalName : 'Uploaded image'}</span>
            </div>
          ))}</div>
        ) : null}
        <label className="playground-upload-button" htmlFor={fieldId}>
          {uploading ? <LoaderCircle className="playground-spinner" size={16} /> : <Upload size={16} />}
          {uploading ? 'Uploading…' : artifacts.length > 0 ? 'Replace image' : 'Upload image'}
        </label>
        <input accept="image/*" aria-describedby={describedBy} disabled={uploading} id={fieldId}
          multiple={field.kind === 'image_collection'}
          onChange={(event) => onUpload(Array.from(event.target.files ?? []))} type="file" />
      </div>
    );
  }
  if (field.kind === 'boolean') {
    return (
      <select aria-describedby={describedBy} id={fieldId}
        onChange={(event) => onChange(event.target.value === ''
          ? undefined : event.target.value === 'true')}
        value={typeof draft === 'boolean' ? String(draft) : ''}>
        {!field.required ? <option value="">Not set</option> : null}
        <option value="true">True</option><option value="false">False</option>
      </select>
    );
  }
  if (field.kind === 'number') {
    return <input aria-describedby={describedBy} id={fieldId} inputMode="decimal"
      onChange={(event) => onChange(event.target.value)} placeholder="0" type="number"
      value={typeof draft === 'string' ? draft : ''} />;
  }
  if (field.kind === 'audio') {
    return <div className="playground-unsupported-input">
      Audio upload will be added with the audio asset contract.
    </div>;
  }
  const jsonLike = field.kind === 'json' || field.kind === 'publication';
  return (
    <textarea aria-describedby={describedBy} id={fieldId}
      onChange={(event) => onChange(event.target.value)}
      placeholder={jsonLike ? '{\n  "key": "value"\n}'
        : field.kind === 'text_collection' ? 'One value per line' : 'Enter text…'}
      rows={jsonLike ? 7 : 6} spellCheck={!jsonLike}
      value={typeof draft === 'string' ? draft : ''} />
  );
}
