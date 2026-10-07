import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { StemsWorkerModule } from './stems/stems-worker.module';

async function bootstrap(): Promise<void> {
  const logger = new Logger('StemsWorkerBootstrap');
  logger.log(
    JSON.stringify({
      event: 'stems_worker.starting',
      nodeEnv: process.env.NODE_ENV,
      databaseConfigured: Boolean(process.env.DATABASE_URL),
      model: process.env.DEMUCS_MODEL ?? 'htdemucs',
    }),
  );
  const app = await NestFactory.createApplicationContext(StemsWorkerModule);
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
