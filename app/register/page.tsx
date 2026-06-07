import type { Metadata } from 'next';
import { AuthFormPage } from '@/features/auth/ui/auth-form-page';

export const metadata: Metadata = {
  title: 'Регистрация | Reverie Image Production',
};

export default function RegisterPage() {
  return <AuthFormPage mode="sign-up" />;
}
