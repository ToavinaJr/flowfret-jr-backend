import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { TranscriptionsWorkerModule } from './transcriptions/transcriptions-worker.module';

async function bootstrap(): Promise<void> {
  const logger = new Logger('TranscriptionWorkerBootstrap');
  logger.log(
    JSON.stringify({
      event: 'worker.starting',
      nodeEnv: process.env.NODE_ENV,
      redisHostConfigured: Boolean(process.env.REDIS_HOST),
      redisUrlConfigured: Boolean(
        process.env.REDIS_URL || process.env.REDIS_PRIVATE_URL,
      ),
      databaseConfigured: Boolean(process.env.DATABASE_URL),
      audiusConfigured: Boolean(process.env.AUDIUS_ACCESS_TOKEN),
      model: process.env.WHISPER_MODEL ?? 'small',
    }),
  );
  const app = await NestFactory.createApplicationContext(
    TranscriptionsWorkerModule,
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
