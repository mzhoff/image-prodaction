export type EmailDeliveryConfig = DisabledEmailDeliveryConfig | SmtpEmailDeliveryConfig;

export interface DisabledEmailDeliveryConfig {
  mode: 'disabled';
}

export interface SmtpEmailDeliveryConfig {
  mode: 'smtp';
  from: string;
  replyTo?: string;
  host: string;
  port: number;
  secure: boolean;
  auth?: {
    user: string;
    password: string;
  };
}

interface EmailEnvironment {
  EMAIL_FROM?: string;
  EMAIL_REPLY_TO?: string;
  EMAIL_TRANSPORT?: string;
  NODE_ENV?: string;
  SMTP_HOST?: string;
  SMTP_PASSWORD?: string;
  SMTP_PORT?: string;
  SMTP_SECURE?: string;
  SMTP_USER?: string;
}

const LOCAL_EMAIL_FROM = 'Reverie <no-reply@reverie.local>';
const LOCAL_SMTP_HOST = 'localhost';
const LOCAL_SMTP_PORT = 1025;

export function readEmailDeliveryConfig(
  environment: EmailEnvironment = process.env,
): EmailDeliveryConfig {
  const isProduction = environment.NODE_ENV === 'production';
  const mode = readTransportMode(environment.EMAIL_TRANSPORT, isProduction);

  if (mode === 'disabled') return { mode };

  const from = readRequiredHeaderValue(
    environment.EMAIL_FROM,
    'EMAIL_FROM',
    isProduction ? undefined : LOCAL_EMAIL_FROM,
  );
  const replyTo = readOptionalHeaderValue(environment.EMAIL_REPLY_TO, 'EMAIL_REPLY_TO');
  const host = readRequiredValue(
    environment.SMTP_HOST,
    'SMTP_HOST',
    isProduction ? undefined : LOCAL_SMTP_HOST,
  );
  const port = readPort(
    environment.SMTP_PORT,
    isProduction ? undefined : LOCAL_SMTP_PORT,
  );
  const secure = readBoolean(
    environment.SMTP_SECURE,
    'SMTP_SECURE',
    isProduction ? undefined : false,
  );
  const auth = readSmtpAuth(environment.SMTP_USER, environment.SMTP_PASSWORD, isProduction);

  return {
    mode,
    from,
    ...(replyTo ? { replyTo } : {}),
    host,
    port,
    secure,
    ...(auth ? { auth } : {}),
  };
}

function readTransportMode(value: string | undefined, isProduction: boolean) {
  const normalized = value?.trim().toLowerCase() || (isProduction ? 'disabled' : 'smtp');
  if (normalized !== 'smtp' && normalized !== 'disabled') {
    throw new Error('EMAIL_TRANSPORT must be either "smtp" or "disabled".');
  }
  return normalized;
}

function readRequiredHeaderValue(
  value: string | undefined,
  variableName: string,
  fallback: string | undefined,
) {
  const normalized = readRequiredValue(value, variableName, fallback);
  assertSafeHeaderValue(normalized, variableName);
  return normalized;
}

function readOptionalHeaderValue(value: string | undefined, variableName: string) {
  const normalized = value?.trim();
  if (!normalized) return undefined;
  assertSafeHeaderValue(normalized, variableName);
  return normalized;
}

function assertSafeHeaderValue(value: string, variableName: string) {
  if (/[\r\n]/.test(value)) {
    throw new Error(`${variableName} must not contain line breaks.`);
  }
}

function readRequiredValue(
  value: string | undefined,
  variableName: string,
  fallback: string | undefined,
) {
  const normalized = value?.trim() || fallback;
  if (!normalized) throw new Error(`${variableName} is required when EMAIL_TRANSPORT=smtp.`);
  return normalized;
}

function readPort(value: string | undefined, fallback: number | undefined) {
  const normalized = value?.trim();
  if (!normalized && fallback !== undefined) return fallback;
  if (!normalized || !/^\d+$/.test(normalized)) {
    throw new Error('SMTP_PORT must be an integer between 1 and 65535.');
  }

  const port = Number(normalized);
  if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) {
    throw new Error('SMTP_PORT must be an integer between 1 and 65535.');
  }
  return port;
}

function readBoolean(
  value: string | undefined,
  variableName: string,
  fallback: boolean | undefined,
) {
  const normalized = value?.trim().toLowerCase();
  if (!normalized && fallback !== undefined) return fallback;
  if (normalized === 'true') return true;
  if (normalized === 'false') return false;
  throw new Error(`${variableName} must be either "true" or "false".`);
}

function readSmtpAuth(
  userValue: string | undefined,
  passwordValue: string | undefined,
  isProduction: boolean,
) {
  const user = userValue?.trim();
  const password = passwordValue;

  if (!user && !password?.length) {
    if (isProduction) {
      throw new Error('SMTP_USER and SMTP_PASSWORD are required for SMTP in production.');
    }
    return undefined;
  }
  if (!user || !password?.length) {
    throw new Error('SMTP_USER and SMTP_PASSWORD must be configured together.');
  }

  return { user, password };
}
