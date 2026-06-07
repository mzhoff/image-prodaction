import type { Metadata } from 'next';
import { AuthFormPage } from '@/features/auth/ui/auth-form-page';

export const metadata: Metadata = {
  title: 'Вход | Reverie Image Production',
};

export default function LoginPage() {
  return <AuthFormPage mode="sign-in" />;
}
