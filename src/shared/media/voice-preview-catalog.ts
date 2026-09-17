import { getConfiguredSpeechModels, getOpenRouterSpeechCapabilities } from '../api/openrouter-speech-capabilities';

export type VoiceGender = 'female' | 'male' | 'unknown';
export interface VoiceProfile {
  name: string;
  spokenName: string;
  gender: VoiceGender;
  /** Proposed audition direction, not a measured acoustic characteristic. */
  direction: string;
  script: string;
  recordingLanguage: 'ru' | 'en';
  recordingText: string;
}

// Gender sources and scope are recorded in docs/voice-auditions.md.
// Never infer gender from a name or from another model's voice with the same name.
type ProfileSeed = [name: string, spokenName: string, gender: VoiceGender, direction: string, english?: string];
const profiles: Record<string, Record<string, ProfileSeed>> = {
  'x-ai/grok-voice-tts-1.0': {
    Eve: ['Eve', 'Иви', 'unknown', 'Говорю живо, с улыбкой и воодушевлением.'],
    Ara: ['Ara', 'Ара', 'unknown', 'Говорю тепло и дружелюбно, как в разговоре с близким человеком.'],
    Rex: ['Rex', 'Рекс', 'unknown', 'Говорю уверенно и чётко, выделяю главное.'],
    Sal: ['Sal', 'Сэл', 'unknown', 'Говорю плавно и спокойно, без резких интонаций.'],
    Leo: ['Leo', 'Лео', 'unknown', 'Говорю уверенно и весомо, но без лишнего пафоса.'],
  },
  'google/gemini-3.1-flash-tts-preview': {
    Kore: ['Kore', 'Коре', 'female', 'Говорю твёрдо и собранно, с ясными акцентами.'],
    Puck: ['Puck', 'Пак', 'male', 'Говорю бодро и легко, добавляю разговору энергии.'],
    Zephyr: ['Zephyr', 'Зефир', 'female', 'Говорю светло и звонко, с открытой интонацией.'],
    Charon: ['Charon', 'Харон', 'male', 'Говорю размеренно и понятно, помогаю разобраться в деталях.'],
    Fenrir: ['Fenrir', 'Фенрир', 'male', 'Говорю эмоционально и увлечённо, с живыми акцентами.'],
  },
  'microsoft/mai-voice-2': {
    'en-US-Harper:MAI-Voice-2': ['Harper', 'Харпер', 'female', 'Говорю открыто и доброжелательно, с лёгкой улыбкой.'],
    'en-US-Ethan:MAI-Voice-2': ['Ethan', 'Итан', 'male', 'Говорю энергично и чётко, держу ровный темп.'],
    'en-US-Olivia:MAI-Voice-2': ['Olivia', 'Оливия', 'female', 'Говорю мягко и выразительно, оставляю место для пауз.'],
    'ru-RU-Masha:MAI-Voice-2': ['Masha', 'Маша', 'female', 'Говорю естественно и просто, как в обычном разговоре.'],
    'ru-RU-Lev:MAI-Voice-2': ['Lev', 'Лев', 'male', 'Говорю спокойно и уверенно, без спешки.'],
    'de-DE-Mia:MAI-Voice-2': ['Mia', 'Мия', 'female', 'Говорю легко и аккуратно, с дружелюбной интонацией.'],
    'de-DE-Klaus:MAI-Voice-2': ['Klaus', 'Клаус', 'male', 'Говорю собранно и последовательно, выделяю важные слова.'],
    'es-ES-Marta:MAI-Voice-2': ['Marta', 'Марта', 'female', 'Говорю тепло и эмоционально, словно делюсь хорошей новостью.'],
    'es-MX-Valeria:MAI-Voice-2': ['Valeria', 'Валерия', 'female', 'Говорю живо и ритмично, с улыбкой в голосе.'],
    'zh-CN-Mei:MAI-Voice-2': ['Mei', 'Мэй', 'female', 'Говорю мягко и плавно, бережно расставляю акценты.'],
    'zh-CN-Bo:MAI-Voice-2': ['Bo', 'Бо', 'male', 'Говорю ровно и ясно, не тороплю слушателя.'],
  },
  'canopylabs/orpheus-3b-0.1-ft': {
    tara: ['Tara', 'Тара', 'unknown', 'Говорю естественно и выразительно, как в живом диалоге.', "Hi, I'm Tara. I speak naturally and expressively, like we're having a real conversation."],
    leah: ['Leah', 'Лия', 'unknown', 'Говорю мягко и неторопливо, даю словам прозвучать.', "Hi, I'm Leah. I speak gently and take my time, giving each thought room to breathe."],
    jess: ['Jess', 'Джесс', 'unknown', 'Говорю бодро и непринуждённо, с лёгкой улыбкой.', "Hi, I'm Jess. I speak with an easy rhythm and a little smile in my voice."],
    leo: ['Leo', 'Лео', 'unknown', 'Говорю спокойно и просто, как собеседник рядом.', "Hi, I'm Leo. I speak calmly and simply, like a friend sitting beside you."],
    dan: ['Dan', 'Дэн', 'unknown', 'Говорю чётко и сдержанно, без лишней торжественности.', "Hi, I'm Dan. I speak clearly and keep things straightforward, without making a big production of it."],
  },
  'hexgrad/kokoro-82m': {
    af_heart: ['Heart', 'Харт', 'female', 'Говорю тепло и мягко, с заботливой интонацией.', "Hi, I'm Heart. I speak warmly and gently, with a little care in every sentence."],
    af_alloy: ['Alloy', 'Эллой', 'female', 'Говорю ровно и понятно, без лишних эмоций.', "Hi, I'm Alloy. I speak evenly and clearly, keeping the message simple."],
    am_adam: ['Adam', 'Адам', 'male', 'Говорю спокойно и размеренно, с короткими паузами.', "Hi, I'm Adam. I speak calmly and steadily, with short pauses between thoughts."],
    bf_emma: ['Emma', 'Эмма', 'female', 'Говорю аккуратно и выразительно, с британским произношением.', "Hi, I'm Emma. I speak clearly and expressively, with a British accent."],
    bm_george: ['George', 'Джордж', 'male', 'Говорю сдержанно и чётко, с британским произношением.', "Hi, I'm George. I speak in a measured, clear voice, with a British accent."],
  },
};
const defaultNames: Record<string, [string, string]> = {
  'zyphra/zonos-v0.1-transformer': ['Zonos Transformer', 'Зонос Трансформер'],
  'zyphra/zonos-v0.1-hybrid': ['Zonos Hybrid', 'Зонос Гибрид'],
  'sesame/csm-1b': ['Sesame CSM', 'Сезам'],
  'mistralai/voxtral-mini-tts-2603': ['Voxtral', 'Вокстрал'],
};

export function getVoiceProfile(model: string, voice: string): VoiceProfile {
  const seed = profiles[model]?.[voice];
  const defaultName = voice === 'default' ? defaultNames[model] : undefined;
  const [name, spokenName, gender, direction, english] = seed ?? [
    defaultName?.[0] ?? voice, defaultName?.[1] ?? voice, 'unknown',
    'Это проба стандартного голоса. Послушаем темп, интонацию и произношение.',
    defaultName ? `Hello, this is ${defaultName[0]}. This is a sample of the default voice. Listen to the pace, expression, and pronunciation.` : undefined,
  ];
  const script = voice === 'default' ? `Привет, это ${spokenName}. ${direction}` : `Привет, я ${spokenName}. ${direction}`;
  return { name, spokenName, gender, direction, script, recordingLanguage: english ? 'en' : 'ru', recordingText: english ?? script };
}

export function getVoiceAuditions() {
  return getConfiguredSpeechModels().flatMap((model) => getOpenRouterSpeechCapabilities(model).voices.map((voice) => ({
    model, voice, ...getVoiceProfile(model, voice),
  })));
}

export const voiceGenderLabels: Record<VoiceGender, string> = {
  female: 'Женский голос', male: 'Мужской голос', unknown: 'Пол голоса не подтверждён',
};

export interface VoicePreviewSample { model: string; voice: string; language: string; src: string }
/** Only reviewed bundled samples; never signed/private workspace URLs or a generation endpoint. */
export function parseVoicePreviewManifest(input: unknown): VoicePreviewSample[] {
  if (!input || typeof input !== 'object' || !('version' in input) || input.version !== 1 || !('samples' in input) || !Array.isArray(input.samples)) return [];
  const seen = new Set<string>();
  return input.samples.slice(0, 500).filter((item): item is VoicePreviewSample => {
    if (!item || typeof item !== 'object' || typeof item.model !== 'string' || typeof item.voice !== 'string'
      || !['ru', 'en'].includes(item.language) || typeof item.src !== 'string'
      || !/^\/voice-previews\/[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*\.(mp3|wav|ogg)$/.test(item.src)) return false;
    const key = JSON.stringify([item.model, item.voice, item.language]);
    if (seen.has(key)) return false;
    seen.add(key); return true;
  });
}
