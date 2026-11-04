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
// This script is for local development only. The VPS override contains
// production-only bind mounts (such as /etc/secrets/youtube-cookies.txt).
const composeFiles = [
  '-f',
  'docker-compose.yml',
  '-f',
  'docker-compose.local.yml',
];
const composeArgs =
  command === 'up'
    ? ['compose', ...composeFiles, 'up', '-d', '--wait', 'db', 'redis']
    : command === 'backend-start'
      ? ['compose', ...composeFiles, 'up', '-d', '--no-build', 'backend']
      : ['worker', 'stems'].includes(command)
        ? ['compose', ...composeFiles, 'build', 'stems-worker']
        : command === 'equalizer'
          ? ['compose', ...composeFiles, 'build', 'backend', 'stems-worker']
        : command === 'worker-start'
          ? [
              'compose',
              ...composeFiles,
              'up',
              '-d',
              '--no-build',
              'transcription-worker',
              'stems-worker',
            ]
          : command === 'worker-logs'
            ? [
                'compose',
                ...composeFiles,
                'logs',
                '-f',
                'transcription-worker',
                'stems-worker',
              ]
            : command === 'down'
              ? ['compose', ...composeFiles, 'down']
              : command === 'status'
                ? ['compose', ...composeFiles, 'ps']
                : null;

if (!composeArgs) {
  throw new Error(
    'Expected one of: up, backend-start, worker, stems, equalizer, worker-start, worker-logs, down, status.',
  );
}

const composeEnvironment = {
  ...process.env,
  BACKEND_ENV_FILE: basename(environmentFile),
  BACKEND_NODE_ENV: 'development',
  POSTGRES_PASSWORD: postgresPassword,
  POSTGRES_HOST_PORT: databaseUrl.port || '5432',
  REDIS_HOST_PORT: redisUrl.port || '6379',
};
const runCompose = (args) =>
  spawnSync('docker', args, {
    cwd: projectRoot,
    env: composeEnvironment,
    stdio: 'inherit',
    windowsHide: true,
  });

const buildResult = runCompose(composeArgs);
if (buildResult.error) throw buildResult.error;
if (!['worker', 'stems', 'equalizer'].includes(command) || buildResult.status !== 0) {
  process.exitCode = buildResult.status ?? 1;
} else {
  const startResult = runCompose([
    'compose',
    ...composeFiles,
    'up',
    '-d',
    '--no-build',
    ...(command === 'equalizer'
      ? ['backend', 'stems-worker']
      : command === 'stems'
        ? ['stems-worker']
        : ['transcription-worker', 'stems-worker']),
  ]);
  if (startResult.error) throw startResult.error;
  process.exitCode = startResult.status ?? 1;
}
