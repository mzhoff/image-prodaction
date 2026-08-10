import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTypeScript from 'eslint-config-next/typescript';

export default defineConfig([
  ...nextVitals,
  ...nextTypeScript,
  {
    rules: {
      '@next/next/no-img-element': 'off',
      '@typescript-eslint/no-unused-vars': ['error', {
        argsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
      }],
      // The app does not enable React Compiler yet. These compiler-oriented
      // rules misclassify composed hook return objects and intentional state
      // synchronization as refs/compiler blockers. Core hook and dependency
      // rules remain enabled.
      'react-hooks/preserve-manual-memoization': 'off',
      'react-hooks/refs': 'off',
      'react-hooks/set-state-in-effect': 'off',
    },
  },
  {
    files: ['scripts/backend-smoke.ts'],
    rules: {
      // The smoke client intentionally traverses heterogeneous JSON payloads
      // from many endpoints; production code remains covered by this rule.
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
  globalIgnores([
    '.next/**',
    'coverage/**',
    'drizzle/meta/**',
    'node_modules/**',
    'playwright-report/**',
    'test-results/**',
  ]),
]);
