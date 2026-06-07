# Local setup

## Requirements

- Node.js `>=20.9.0`; local development currently uses Node `24`.
- npm `>=10`.
- Docker with Docker Compose for local PostgreSQL and MinIO.
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
S3_ENDPOINT=http://localhost:9000
S3_PUBLIC_BASE_URL=http://localhost:9000/image-prodaction-assets
S3_REGION=us-east-1
S3_BUCKET=image-prodaction-assets
S3_ACCESS_KEY_ID=minioadmin
S3_SECRET_ACCESS_KEY=minioadmin
S3_FORCE_PATH_STYLE=true
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/image_prodaction
BETTER_AUTH_URL=http://localhost:3004
BETTER_AUTH_SECRET=generated_secret_here
```

Generate a local Better Auth secret with:

```bash
openssl rand -base64 32
```

`OPENROUTER_API_KEY` and `BETTER_AUTH_SECRET` are required secrets. They are used only in Next.js API routes, not in browser code.

`OPENROUTER_SITE_URL` and `OPENROUTER_APP_NAME` are metadata headers sent to OpenRouter. If you run the app on another port, update `OPENROUTER_SITE_URL`.

Never commit `.env.local`.

## Database and Storage

Start PostgreSQL and MinIO:

```bash
docker compose up -d postgres minio minio-init
```

Apply Drizzle migrations:

```bash
npm run db:migrate
```

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
- Image assets are uploaded by API routes to S3-compatible storage and rendered in the frontend through public S3 URLs.
- Authentication data is stored in local PostgreSQL through Better Auth and Drizzle.
