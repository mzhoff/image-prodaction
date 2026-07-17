export const openRouterCredentialFixture = {
  data: {
    is_free_tier: false,
    label: 'Reverie test key',
    limit: 25,
    limit_remaining: 18.75,
    limit_reset: 'monthly',
    usage: 6.25,
    usage_daily: 0.5,
    usage_weekly: 2,
    usage_monthly: 6.25,
  },
};

export const openRouterModelsFixture = {
  data: [{
    architecture: {
      input_modalities: ['text', 'image'],
      output_modalities: ['text', 'image'],
    },
    id: 'google/gemini-image',
    name: 'Gemini Image',
  }, {
    architecture: {
      input_modalities: ['text'],
      output_modalities: ['audio'],
    },
    id: 'openai/audio-model',
    name: 'Audio model',
  }],
};

export const openRouterMultimodalResultFixture = {
  choices: [{
    finish_reason: 'stop',
    message: {
      audio: {
        data: 'ZmFrZS1hdWRpbw==',
        format: 'mp3',
      },
      content: 'Generated response',
      images: [{
        image_url: {
          url: 'data:image/png;base64,ZmFrZS1pbWFnZQ==',
        },
        type: 'image_url',
      }],
    },
    native_finish_reason: 'STOP',
  }],
  id: 'gen-fixture-1',
  model: 'google/gemini-image',
  provider: 'Google',
  usage: {
    completion_tokens: 25,
    completion_tokens_details: {
      reasoning_tokens: 3,
    },
    cost: 0.0125,
    prompt_tokens: 75,
    prompt_tokens_details: {
      cache_write_tokens: 4,
      cached_tokens: 10,
    },
    total_tokens: 100,
  },
};

export const openRouterPartialUsageFixture = {
  completion_tokens: 7,
  cost: '0.0007',
};

export const openRouterMissingImageFixture = {
  choices: [{
    finish_reason: 'stop',
    message: {
      content: 'No image was returned.',
    },
  }],
  id: 'gen-missing-image',
  model: 'google/gemini-image',
  provider: 'Google',
  usage: {
    completion_tokens: 5,
    prompt_tokens: 10,
    total_tokens: 15,
  },
};

export const openRouterGenerationStatusFixture = {
  data: {
    id: 'gen-fixture-1',
    model: 'google/gemini-image',
    tokens_completion: 25,
    tokens_prompt: 75,
    total_cost: 0.0125,
  },
};

export function openRouterErrorFixture(status: number, errorType?: string) {
  return {
    error: {
      code: status,
      message: `Fixture provider error ${status}`,
      metadata: errorType ? { error_type: errorType } : {},
    },
  };
}
