import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { config } from 'dotenv';

process.env.NODE_ENV = 'test';
process.env.DEBUG = 'false';

if (!process.env.DATABASE_URL) {
  for (const file of ['.env.test.local', '.env.development.local']) {
    const path = resolve(process.cwd(), file);
    if (existsSync(path)) config({ path, override: false, quiet: true });
  }
}

process.env.JWT_SECRET ??= 'e2e-only-secret-containing-at-least-32-characters';
process.env.APP_URL ??= 'http://localhost:8080';
process.env.CORS_ORIGINS ??= 'http://localhost:8080';
process.env.REDIS_HOST ??= 'localhost';
process.env.REDIS_PORT ??= '6379';

if (!process.env.DATABASE_URL) {
  throw new Error(
    'E2E DATABASE_URL is missing. Start local infrastructure with `npm run infra:up` or provide a CI database.',
  );
}
