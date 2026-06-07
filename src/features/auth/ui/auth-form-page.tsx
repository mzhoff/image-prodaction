'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, LogIn, UserPlus } from 'lucide-react';
import { signIn, signUp, useSession } from '@/shared/auth/client';
import { getAuthErrorMessage, getFallbackName } from '@/features/auth/lib/auth-form-utils';

type AuthFormMode = 'sign-in' | 'sign-up';

interface AuthFormPageProps {
  mode: AuthFormMode;
}

const authCopy = {
  'sign-in': {
    title: 'Вход',
    subtitle: 'Продолжите работу в Reverie Image Production',
    submit: 'Войти',
    alternateText: 'Нет аккаунта?',
    alternateHref: '/register',
    alternateLabel: 'Создать аккаунт',
    icon: LogIn,
  },
  'sign-up': {
    title: 'Регистрация',
    subtitle: 'Создайте аккаунт для Reverie Image Production',
    submit: 'Создать аккаунт',
    alternateText: 'Уже есть аккаунт?',
    alternateHref: '/login',
    alternateLabel: 'Войти',
    icon: UserPlus,
  },
} satisfies Record<AuthFormMode, {
  title: string;
  subtitle: string;
  submit: string;
  alternateText: string;
  alternateHref: string;
  alternateLabel: string;
  icon: typeof LogIn;
}>;

export function AuthFormPage({ mode }: AuthFormPageProps) {
  const router = useRouter();
  const { data: session, error: sessionError, isPending, refetch } = useSession();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const copy = authCopy[mode];
  const Icon = copy.icon;

  const disabled = busy || isPending;
  const shownError = useMemo(() => formError ?? sessionError?.message ?? null, [formError, sessionError?.message]);

  useEffect(() => {
    if (!isPending && session?.user.id) {
      router.replace('/');
    }
  }, [isPending, router, session?.user.id]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setFormError(null);

    const credentials = {
      email: email.trim(),
      password,
      rememberMe: true,
    };

    try {
      const result =
        mode === 'sign-in'
          ? await signIn.email(credentials)
          : await signUp.email({
              ...credentials,
              name: getFallbackName(email),
            });

      if (result.error) {
        setFormError(getAuthErrorMessage(result.error));
        return;
      }

      await refetch();
      router.replace('/');
      router.refresh();
    } catch (error) {
      setFormError(getAuthErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-page">
      <header className="auth-page-header">
        <Link href="/" className="auth-back-link">
          <ArrowLeft size={16} />
          Редактор
        </Link>
        <div className="auth-page-brand">
          <span className="editor-brand-mark">R</span>
          <span>Reverie Image Production</span>
        </div>
      </header>

      <section className="auth-page-body">
        <div className="auth-card">
          <div className="auth-card-heading">
            <span className="auth-card-icon">
              <Icon size={18} />
            </span>
            <div>
              <h1>{copy.title}</h1>
              <p>{copy.subtitle}</p>
            </div>
          </div>

          <form className="auth-form" onSubmit={handleSubmit}>
            <label className="auth-field">
              <span>Email</span>
              <input
                type="email"
                name="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="email"
                disabled={disabled}
                required
              />
            </label>

            <label className="auth-field">
              <span>Пароль</span>
              <input
                type="password"
                name="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete={mode === 'sign-in' ? 'current-password' : 'new-password'}
                minLength={8}
                disabled={disabled}
                required
              />
            </label>

            {shownError ? <p className="auth-error">{shownError}</p> : null}

            <button type="submit" className="auth-submit" disabled={disabled}>
              {busy ? '...' : copy.submit}
            </button>
          </form>

          <p className="auth-alternate">
            <span>{copy.alternateText}</span>
            <Link href={copy.alternateHref}>{copy.alternateLabel}</Link>
          </p>
        </div>
      </section>
    </main>
  );
}
