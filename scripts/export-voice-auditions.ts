import { getVoiceAuditions } from '../src/shared/media/voice-preview-catalog';

// Read-only export. Never submits synthesis jobs or reads provider credentials.
const args = process.argv.slice(2);
const option = (key: string) => {
  const value = args[args.indexOf(key) + 1];
  if (!value || value.startsWith('--')) throw new Error(`Missing value for ${key}`);
  return value;
};
const model = args.includes('--model') ? option('--model') : undefined;
const format = args.includes('--format') ? option('--format') : 'json';
const rows = getVoiceAuditions().filter((item) => !model || item.model === model);
if (!rows.length) throw new Error('No configured voices for this model');
if (!['json', 'names', 'scripts'].includes(format)) throw new Error('Use --format json, names, or scripts');
if (format === 'json') process.stdout.write(`${JSON.stringify(rows, null, 2)}\n`);
if (format === 'names') process.stdout.write(`${rows.map((item) => item.voice).join('\n===VOICE===\n')}\n`);
if (format === 'scripts') process.stdout.write(`${rows.map((item) => item.recordingText).join('\n===VOICE===\n')}\n`);
