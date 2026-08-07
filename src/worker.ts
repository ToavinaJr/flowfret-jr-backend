import { NestFactory } from '@nestjs/core';
import { TranscriptionsWorkerModule } from './transcriptions/transcriptions-worker.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.createApplicationContext(
    TranscriptionsWorkerModule,
  );
  app.enableShutdownHooks();
}
void bootstrap();
