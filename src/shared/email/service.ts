import type { SmtpEmailDeliveryConfig } from './config';
import { createSmtpEmailTransport } from './smtp-transport';
import {
  renderPasswordChangedTemplate,
  renderResetPasswordTemplate,
  renderVerifyEmailTemplate,
} from './templates';
import type { EmailTransport } from './transport';

interface EmailRecipient {
  email: string;
  name?: string | null;
}

interface ActionEmailInput extends EmailRecipient {
  actionUrl: string;
  expiresInSeconds: number;
}

interface PasswordChangedEmailInput extends EmailRecipient {
  signInUrl: string;
}

interface EmailServiceOptions {
  from: string;
  replyTo?: string;
}

export class EmailService {
  private readonly transport: EmailTransport;
  private readonly options: EmailServiceOptions;

  constructor(
    transport: EmailTransport,
    options: EmailServiceOptions,
  ) {
    this.transport = transport;
    this.options = options;
  }

  async sendVerificationEmail(input: ActionEmailInput) {
    await this.send(input.email, renderVerifyEmailTemplate(input));
  }

  async sendPasswordResetEmail(input: ActionEmailInput) {
    await this.send(input.email, renderResetPasswordTemplate(input));
  }

  async sendPasswordChangedEmail(input: PasswordChangedEmailInput) {
    await this.send(input.email, renderPasswordChangedTemplate(input));
  }

  private async send(
    to: string,
    template: { subject: string; text: string; html: string },
  ) {
    await this.transport.send({
      from: this.options.from,
      to,
      ...(this.options.replyTo ? { replyTo: this.options.replyTo } : {}),
      ...template,
    });
  }
}

export function createSmtpEmailService(config: SmtpEmailDeliveryConfig) {
  return new EmailService(createSmtpEmailTransport(config), {
    from: config.from,
    ...(config.replyTo ? { replyTo: config.replyTo } : {}),
  });
}
