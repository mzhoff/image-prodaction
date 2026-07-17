import nodemailer from 'nodemailer';
import type { SmtpEmailDeliveryConfig } from './config';
import type { EmailMessage, EmailTransport } from './transport';

interface SmtpClient {
  sendMail(message: EmailMessage): Promise<unknown>;
}

interface SmtpConnectionOptions {
  host: string;
  port: number;
  secure: boolean;
  auth?: {
    user: string;
    pass: string;
  };
  logger: false;
  debug: false;
}

type SmtpClientFactory = (options: SmtpConnectionOptions) => SmtpClient;

export function createSmtpEmailTransport(
  config: SmtpEmailDeliveryConfig,
  createClient: SmtpClientFactory = defaultSmtpClientFactory,
): EmailTransport {
  const client = createClient({
    host: config.host,
    port: config.port,
    secure: config.secure,
    ...(config.auth
      ? {
          auth: {
            user: config.auth.user,
            pass: config.auth.password,
          },
        }
      : {}),
    logger: false,
    debug: false,
  });

  return {
    async send(message) {
      await client.sendMail(message);
    },
  };
}

function defaultSmtpClientFactory(options: SmtpConnectionOptions) {
  return nodemailer.createTransport(options);
}
