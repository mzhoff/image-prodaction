import { z } from 'zod';
import { CURRENT_TERMS_VERSION } from './terms-contract';

type Clock = () => Date;

export function createTermsAcceptanceAdditionalFields(clock: Clock = () => new Date()) {
  return {
    termsAccepted: {
      type: 'boolean',
      required: true,
      returned: false,
      fieldName: 'termsAcceptedAt',
      validator: {
        input: z.literal(true, { error: 'Terms acceptance is required.' }),
      },
      transform: {
        input: () => clock(),
      },
    },
    termsVersion: {
      type: 'string',
      required: true,
      returned: false,
      validator: {
        input: z.literal(CURRENT_TERMS_VERSION, { error: 'Terms version is not current.' }),
      },
    },
  } as const;
}

export const termsAcceptanceAdditionalFields = createTermsAcceptanceAdditionalFields();
