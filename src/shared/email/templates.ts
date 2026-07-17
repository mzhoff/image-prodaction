export interface EmailTemplate {
  subject: string;
  text: string;
  html: string;
}

interface ActionEmailInput {
  name?: string | null;
  actionUrl: string;
  expiresInSeconds: number;
}

interface PasswordChangedEmailInput {
  name?: string | null;
  signInUrl: string;
}

export function renderVerifyEmailTemplate(input: ActionEmailInput): EmailTemplate {
  const greeting = createGreeting(input.name);
  const expiration = formatExpiration(input.expiresInSeconds);

  return renderActionEmail({
    subject: 'Подтвердите email в Reverie',
    preheader: 'Подтвердите адрес электронной почты для доступа к Reverie.',
    heading: 'Подтвердите email',
    greeting,
    body: `Подтвердите адрес электронной почты, чтобы завершить регистрацию и войти в Reverie. Ссылка действует ${expiration}.`,
    buttonLabel: 'Подтвердить email',
    actionUrl: input.actionUrl,
    securityNote: 'Если вы не создавали аккаунт в Reverie, просто проигнорируйте это письмо.',
  });
}

export function renderResetPasswordTemplate(input: ActionEmailInput): EmailTemplate {
  const greeting = createGreeting(input.name);
  const expiration = formatExpiration(input.expiresInSeconds);

  return renderActionEmail({
    subject: 'Сбросьте пароль в Reverie',
    preheader: 'Используйте защищённую ссылку, чтобы установить новый пароль.',
    heading: 'Сброс пароля',
    greeting,
    body: `Мы получили запрос на смену пароля. Установите новый пароль по защищённой ссылке ниже. Ссылка действует ${expiration}.`,
    buttonLabel: 'Установить новый пароль',
    actionUrl: input.actionUrl,
    securityNote: 'Если вы не запрашивали сброс пароля, проигнорируйте письмо. Ваш текущий пароль останется прежним.',
  });
}

export function renderPasswordChangedTemplate(
  input: PasswordChangedEmailInput,
): EmailTemplate {
  return renderActionEmail({
    subject: 'Пароль в Reverie изменён',
    preheader: 'Пароль вашего аккаунта Reverie был изменён.',
    heading: 'Пароль изменён',
    greeting: createGreeting(input.name),
    body: 'Пароль вашего аккаунта был успешно изменён. Все активные сессии завершены.',
    buttonLabel: 'Войти в Reverie',
    actionUrl: input.signInUrl,
    securityNote: 'Если это были не вы, немедленно сбросьте пароль и проверьте безопасность своей почты.',
  });
}

interface RenderActionEmailInput {
  subject: string;
  preheader: string;
  heading: string;
  greeting: string;
  body: string;
  buttonLabel: string;
  actionUrl: string;
  securityNote: string;
}

function renderActionEmail(input: RenderActionEmailInput): EmailTemplate {
  const text = [
    input.heading,
    '',
    input.greeting,
    '',
    input.body,
    '',
    `${input.buttonLabel}: ${input.actionUrl}`,
    '',
    input.securityNote,
    '',
    'Команда Reverie',
  ].join('\n');

  const safeActionUrl = escapeHtml(input.actionUrl);
  const html = `<!doctype html>
<html lang="ru">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(input.subject)}</title>
  </head>
  <body style="margin:0;background:#f5f5f7;color:#16161a;font-family:Arial,sans-serif;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(input.preheader)}</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f5f5f7;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:#ffffff;border-radius:24px;padding:40px;">
            <tr>
              <td>
                <div style="font-size:20px;font-weight:800;letter-spacing:-0.5px;margin-bottom:32px;">REVERIE</div>
                <h1 style="font-size:30px;line-height:1.2;margin:0 0 20px;">${escapeHtml(input.heading)}</h1>
                <p style="font-size:16px;line-height:1.6;margin:0 0 12px;">${escapeHtml(input.greeting)}</p>
                <p style="font-size:16px;line-height:1.6;color:#5f6270;margin:0 0 28px;">${escapeHtml(input.body)}</p>
                <p style="margin:0 0 28px;">
                  <a href="${safeActionUrl}" style="display:inline-block;background:#6447ff;color:#ffffff;text-decoration:none;font-size:16px;font-weight:700;padding:14px 22px;border-radius:12px;">${escapeHtml(input.buttonLabel)}</a>
                </p>
                <p style="font-size:13px;line-height:1.6;color:#7a7d89;margin:0 0 8px;">Если кнопка не работает, скопируйте ссылку:</p>
                <p style="font-size:13px;line-height:1.6;word-break:break-all;margin:0 0 28px;">
                  <a href="${safeActionUrl}" style="color:#5640d8;">${safeActionUrl}</a>
                </p>
                <hr style="border:0;border-top:1px solid #ececf1;margin:0 0 24px;">
                <p style="font-size:13px;line-height:1.6;color:#7a7d89;margin:0;">${escapeHtml(input.securityNote)}</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  return {
    subject: input.subject,
    text,
    html,
  };
}

function createGreeting(name: string | null | undefined) {
  const normalized = name?.trim();
  return normalized ? `Здравствуйте, ${normalized}!` : 'Здравствуйте!';
}

function formatExpiration(seconds: number) {
  if (seconds % 86_400 === 0) {
    const days = seconds / 86_400;
    return `${days} ${pluralize(days, ['день', 'дня', 'дней'])}`;
  }
  if (seconds % 3_600 === 0) {
    const hours = seconds / 3_600;
    return `${hours} ${pluralize(hours, ['час', 'часа', 'часов'])}`;
  }
  const minutes = Math.max(1, Math.ceil(seconds / 60));
  return `${minutes} ${pluralize(minutes, ['минуту', 'минуты', 'минут'])}`;
}

function pluralize(value: number, forms: [string, string, string]) {
  const modulo100 = value % 100;
  const modulo10 = value % 10;
  if (modulo100 >= 11 && modulo100 <= 14) return forms[2];
  if (modulo10 === 1) return forms[0];
  if (modulo10 >= 2 && modulo10 <= 4) return forms[1];
  return forms[2];
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
