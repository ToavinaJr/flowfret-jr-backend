import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TranscriptionsWorkerModule } from './transcriptions/transcriptions-worker.module';

async function bootstrap(): Promise<void> {
  const logger = new Logger('TranscriptionWorkerBootstrap');
  const app = await NestFactory.createApplicationContext(
    TranscriptionsWorkerModule,
  );
  const config = app.get(ConfigService);
  logger.log(
    JSON.stringify({
      event: 'worker.starting',
      nodeEnv: config.get<string>('NODE_ENV'),
      redisConfigured: Boolean(
        config.get<string>('REDIS_HOST') ||
        config.get<string>('REDIS_URL') ||
        config.get<string>('REDIS_PRIVATE_URL'),
      ),
      databaseConfigured: Boolean(config.get<string>('DATABASE_URL')),
      audiusConfigured: Boolean(config.get<string>('AUDIUS_ACCESS_TOKEN')),
      transcriptionProvider: config.get<string>('LLM_PROVIDER') ?? 'whisper',
      model: config.get<string>('WHISPER_MODEL') ?? 'small',
    }),
  );
  app.enableShutdownHooks();
  logger.log(JSON.stringify({ event: 'worker.ready' }));
}
void bootstrap().catch((error: unknown) => {
  new Logger('TranscriptionWorkerBootstrap').error(
    JSON.stringify({
      event: 'worker.bootstrap_failed',
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    }),
  );
  process.exitCode = 1;
});
