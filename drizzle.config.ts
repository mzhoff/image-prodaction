import { config } from 'dotenv';
import { defineConfig } from 'drizzle-kit';

config({ path: '.env.local' });
config({ path: '.env' });

const databaseUrl = process.env.DATABASE_URL?.trim();
if (!databaseUrl) throw new Error('DATABASE_URL is required to run Drizzle commands.');

export default defineConfig({
  schema: [
    './src/shared/db/schema/index.ts',
    './src/modules/chat-assistant/server/chat-persistence-schema.ts',
    './src/modules/chat-assistant/server/document-conversation-schema.ts',
    './src/modules/chat-assistant/server/pipeline-action-schema.ts',
    './src/modules/chat-assistant/server/pipeline-update-schema.ts',
    './src/modules/executable-pipelines/adapters/postgres/pipeline-schema.ts',
  ],
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: databaseUrl,
  },
  strict: true,
  verbose: true,
});
