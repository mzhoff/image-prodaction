export const CURRENT_TERMS_VERSION = '2026-07-16';

export const termsAcceptanceClientFields = {
  termsAccepted: {
    type: 'boolean',
    required: true,
    returned: false,
  },
  termsVersion: {
    type: 'string',
    required: true,
    returned: false,
  },
} as const;
