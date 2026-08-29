import localFont from 'next/font/local';

export const onest = localFont({
  src: '../public/fonts/onest/Onest-VariableFont_wght.ttf',
  display: 'swap',
  fallback: ['Arial', 'sans-serif'],
  variable: '--font-onest',
  weight: '100 900',
});
