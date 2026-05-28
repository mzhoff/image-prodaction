# Local setup

## Requirements

- Node.js `>=20.9.0`; local development currently uses Node `24`.
- npm `>=10`.
- OpenRouter account and API key for real model calls.

If you use `nvm`:

```bash
nvm use
```

## Install

```bash
npm install
```

## Environment

Create a local env file from the template:

```bash
cp .env.example .env.local
```

Fill `.env.local`:

```bash
OPENROUTER_API_KEY=your_openrouter_key_here
OPENROUTER_SITE_URL=http://localhost:3004
OPENROUTER_APP_NAME=Reverie Image Production Pipeline
```

`OPENROUTER_API_KEY` is the only required secret. It is used only in Next.js API routes, not in browser code.

`OPENROUTER_SITE_URL` and `OPENROUTER_APP_NAME` are metadata headers sent to OpenRouter. If you run the app on another port, update `OPENROUTER_SITE_URL`.

Never commit `.env.local`.

## Run

```bash
npm run dev:local
```

Open [http://localhost:3004](http://localhost:3004).

If port `3004` is busy:

```bash
npm run dev -- -p 3005
```

Then update `OPENROUTER_SITE_URL` in `.env.local` to match the selected port.

## Validate Before Pushing

```bash
npm run typecheck
npm run build
```

## Local Storage Model

- Graph metadata is persisted in browser storage through Zustand.
- Image assets are stored locally in IndexedDB.
- There is no backend database, auth or S3/MinIO in the current MVP.
