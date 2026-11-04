import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { accessSync, constants, existsSync } from 'node:fs';
import { join } from 'node:path';
import { StemsWorkerModule } from './stems/stems-worker.module';

function isWritable(directory: string): boolean {
  try {
    accessSync(directory, constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

async function bootstrap(): Promise<void> {
  const logger = new Logger('StemsWorkerBootstrap');
  const app = await NestFactory.createApplicationContext(StemsWorkerModule);
  const config = app.get(ConfigService);
  const model = config.get<string>('AUDIO_STEMS_ENGINE') ?? 'demucs';
  const modelDirectory = config.get<string>('AUDIO_STEMS_MODEL_DIR') ?? '';
  const tempDirectory =
    config.get<string>('AUDIO_STEMS_TEMP_DIR') ?? '/stems-tmp';
  logger.log(
    JSON.stringify({
      event: 'stems_worker.starting',
      nodeEnv: config.get<string>('NODE_ENV'),
      databaseConfigured: Boolean(config.get<string>('DATABASE_URL')),
      engine: model,
      configuredDemucsModel: config.get<string>('DEMUCS_MODEL') ?? 'htdemucs',
      cpuThreads: Number(config.get<string>('AUDIO_STEMS_CPU_THREADS') ?? 2),
      separationTimeoutMs: Number(
        config.get<string>('AUDIO_STEMS_TIMEOUT_MS') ?? 600_000,
      ),
      maxDurationSeconds: Number(
        config.get<string>('AUDIO_STEMS_MAX_DURATION_SECONDS') ?? 420,
      ),
      modelDirectoryConfigured: Boolean(modelDirectory),
      modelDirectoryExists: modelDirectory ? existsSync(modelDirectory) : false,
      modelDirectoryWritable: modelDirectory
        ? isWritable(modelDirectory)
        : false,
      mdxWeightsPresent: modelDirectory
        ? existsSync(join(modelDirectory, 'UVR-MDX-NET-Voc_FT.onnx'))
        : false,
      tempDirectoryExists: existsSync(tempDirectory),
      tempDirectoryWritable: isWritable(tempDirectory),
    }),
  );
  app.enableShutdownHooks();
  logger.log(JSON.stringify({ event: 'stems_worker.ready' }));
}
void bootstrap().catch((error: unknown) => {
  new Logger('StemsWorkerBootstrap').error(
    JSON.stringify({
      event: 'stems_worker.bootstrap_failed',
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    }),
  );
  process.exitCode = 1;
});
