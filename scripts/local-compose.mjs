import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { config } from 'dotenv';

const projectRoot = resolve(import.meta.dirname, '..');
const localEnvironmentFile = resolve(projectRoot, '.env.development.local');
const environmentFile = existsSync(localEnvironmentFile)
  ? localEnvironmentFile
  : resolve(projectRoot, '.env.development');

if (!existsSync(environmentFile)) {
  throw new Error(
    'Missing .env.development. Copy .env.example before starting local infrastructure.',
  );
}

config({ path: environmentFile, quiet: true });

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is required in .env.development.');
}

const databaseUrl = new URL(process.env.DATABASE_URL);
if (!['localhost', '127.0.0.1'].includes(databaseUrl.hostname)) {
  throw new Error('infra:* commands only accept a local DATABASE_URL.');
}
const postgresPassword =
  process.env.POSTGRES_PASSWORD || decodeURIComponent(databaseUrl.password);
if (!postgresPassword) {
  throw new Error(
    'The local DATABASE_URL must contain the PostgreSQL password.',
  );
}
const redisUrl = new URL(process.env.REDIS_URL || 'redis://localhost:6379');
if (!['localhost', '127.0.0.1'].includes(redisUrl.hostname)) {
  throw new Error('infra:* commands only accept a local REDIS_URL.');
}

const command = process.argv[2];
if (
  ['worker', 'worker-start'].includes(command) &&
  !process.env.AUDIUS_ACCESS_TOKEN
) {
  throw new Error(
    'AUDIUS_ACCESS_TOKEN is required by the transcription worker. Add the Audius API bearer token to .env.development.local.',
  );
}
const composeArgs =
  command === 'up'
    ? ['compose', 'up', '-d', '--wait', 'db', 'redis']
    : command === 'worker'
      ? ['compose', 'up', '-d', '--build', 'transcription-worker']
      : command === 'worker-start'
        ? ['compose', 'up', '-d', '--no-build', 'transcription-worker']
        : command === 'worker-logs'
          ? ['compose', 'logs', '-f', 'transcription-worker']
          : command === 'down'
            ? ['compose', 'down']
            : command === 'status'
              ? ['compose', 'ps']
              : null;

if (!composeArgs) {
  throw new Error(
    'Expected one of: up, worker, worker-start, worker-logs, down, status.',
  );
}

const result = spawnSync('docker', composeArgs, {
  cwd: projectRoot,
  env: {
    ...process.env,
    BACKEND_ENV_FILE: basename(environmentFile),
    BACKEND_NODE_ENV: 'development',
    POSTGRES_PASSWORD: postgresPassword,
    POSTGRES_HOST_PORT: databaseUrl.port || '5432',
    REDIS_HOST_PORT: redisUrl.port || '6379',
  },
  stdio: 'inherit',
  windowsHide: true,
});

if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
