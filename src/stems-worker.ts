import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { StemsWorkerModule } from './stems/stems-worker.module';

async function bootstrap(): Promise<void> {
  const logger = new Logger('StemsWorkerBootstrap');
  const app = await NestFactory.createApplicationContext(StemsWorkerModule);
  const config = app.get(ConfigService);
  logger.log(
    JSON.stringify({
      event: 'stems_worker.starting',
      nodeEnv: config.get<string>('NODE_ENV'),
      databaseConfigured: Boolean(config.get<string>('DATABASE_URL')),
      model: config.get<string>('DEMUCS_MODEL') ?? 'htdemucs',
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
