import { config } from 'dotenv';
import { resolve } from 'node:path';
import { defineConfig } from 'prisma/config';

const nodeEnv = process.env.NODE_ENV ?? 'development';

config({ path: resolve(process.cwd(), `.env.${nodeEnv}.local`) });
config({ path: resolve(process.cwd(), `.env.${nodeEnv}`) });
config({ path: resolve(process.cwd(), '.env.local') });
config({ path: resolve(process.cwd(), '.env') });

const databaseUrl = process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL;
const generateOnly = process.env.PRISMA_GENERATE_ONLY === '1';
if (!databaseUrl && !generateOnly) {
  throw new Error(
    `DATABASE_URL or DIRECT_DATABASE_URL is missing. Set it in .env.${nodeEnv} (or .env).`,
  );
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    // Generation needs the schema but does not connect to PostgreSQL.
    // Migrations and all other commands still require a real URL above.
    url:
      databaseUrl ??
      'postgresql://prisma-generate:prisma-generate@localhost:5432/prisma-generate',
  },
});
