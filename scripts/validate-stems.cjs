// Run inside the built worker: node scripts/validate-stems.cjs /path/to/audio
// Or pipe this file to: docker exec -i backend-stems-worker-1 node - /path/to/audio
// --upload additionally checks delivery through Cloudinary, then deletes only
// the assets created by this validation. No queue or existing DB row is changed.
const { resolve } = require('node:path');
const { readFile, rm } = require('node:fs/promises');
const { execFileSync } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const { ConfigService } = require('@nestjs/config');
const { Logger } = require('@nestjs/common');
const { StemsBridgeService } = require(resolve('dist/stems/stems-bridge.service'));
const { StemsWorkerConfigService } = require(resolve('dist/stems/stems-worker-config.service'));
const { CloudinaryService } = require(resolve('dist/uploads/cloudinary.service'));
const logger = new Logger('StemsValidation');

async function main() {
  if (!process.argv[2]) throw new Error('Provide a local audio path');
  const config = new ConfigService();
  const bridge = new StemsBridgeService(new StemsWorkerConfigService(config));
  const storage = new CloudinaryService(config);
  const createdAssets = [];
  let result;
  const started = Date.now();
  try {
    result = await bridge.separate({
      audioStemId: `validation-${randomUUID()}`,
      audioPath: resolve(process.argv[2]),
      engineVersion: process.argv.includes('--uvr-mdx') ? 'uvr-mdx-0.48.0-voc-ft-v1'
        : process.argv.includes('--uvr-ensemble') ? 'uvr-ensemble-0.48.0-voc-ft-v1'
          : process.argv.includes('--uvr-demo') ? 'uvr-demo-v1' : undefined,
    });
    for (const path of [result.vocalsPath, result.instrumentalPath]) {
      const duration = Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', path], { encoding: 'utf8' }));
      if (!Number.isFinite(duration) || Math.abs(duration - result.duration) > 0.2) throw new Error('Invalid output duration');
      if (process.argv.includes('--upload')) {
        const uploaded = await storage.uploadAudioStem({ buffer: await readFile(path), filename: `validation-${randomUUID()}.mp3` });
        createdAssets.push(uploaded.publicId);
        const response = await fetch(uploaded.url, { signal: AbortSignal.timeout(30_000) });
        if (!response.ok || (await response.arrayBuffer()).byteLength === 0) throw new Error('Uploaded stem could not be downloaded');
      }
    }
    logger.log(JSON.stringify({ event: 'audio_stems.validation_passed', durationSeconds: result.duration, elapsedMs: Date.now() - started, outputs: 2, storageVerified: process.argv.includes('--upload') }));
  } finally {
    for (const id of createdAssets) await storage.deleteAudioStem(id);
    if (result) await rm(result.tempDir, { recursive: true, force: true });
  }
}
main().catch((error) => {
  logger.error(String(error.message).replace(/https?:\/\/\S+/gi, '[redacted-url]'));
  process.exitCode = 1;
});
