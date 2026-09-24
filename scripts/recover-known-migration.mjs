import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const FAILED_MIGRATION = '20260923180000_transcription_provider';
const prismaCli = resolve(
  import.meta.dirname,
  '..',
  'node_modules',
  'prisma',
  'build',
  'index.js',
);

function runPrisma(args) {
  return spawnSync(process.execPath, [prismaCli, 'migrate', ...args], {
    cwd: process.cwd(),
    env: process.env,
    encoding: 'utf8',
    shell: false,
  });
}

function writeResult(result) {
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.error) console.error(result.error.message);
}

const deploy = runPrisma(['deploy']);
writeResult(deploy);
const deployOutput = `${deploy.stdout ?? ''}\n${deploy.stderr ?? ''}`;

if (deploy.status === 0) {
  process.exit(0);
}

const isKnownFailure =
  deployOutput.includes('P3009') && deployOutput.includes(FAILED_MIGRATION);

if (!isKnownFailure) {
  process.exit(deploy.status ?? 1);
}

console.warn(
  `[migration-recovery] Marking known failed migration ${FAILED_MIGRATION} as rolled back before replay.`,
);
const recovery = runPrisma(['resolve', '--rolled-back', FAILED_MIGRATION]);
writeResult(recovery);

if (recovery.status !== 0) {
  process.exit(recovery.status ?? 1);
}

const replay = runPrisma(['deploy']);
writeResult(replay);
process.exit(replay.status ?? 1);
