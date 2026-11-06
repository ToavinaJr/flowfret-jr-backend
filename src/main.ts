import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ConfigService } from '@nestjs/config';
import { configureHttpSecurity } from './common/http-security';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const config = app.get(ConfigService);
  const bodyLimitKb = positiveInteger(
    config.get<string>('GRAPHQL_BODY_LIMIT_KB'),
    64,
  );
  app.useBodyParser('json', { limit: `${bodyLimitKb}kb` });
  configureHttpSecurity(app, config);
  app.enableShutdownHooks();
  const port = positiveInteger(config.get<string>('PORT'), 3000);
  if (port > 65535) throw new Error('PORT must be between 1 and 65535.');

  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );

  await app.listen(port);
  logger.log(
    `Backend listening on port ${port}; DEBUG=${config.get<string>('DEBUG') ?? 'false'}`,
  );
}

function positiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value ?? fallback);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error('Configuration value must be a positive integer.');
  }
  return parsed;
}
void bootstrap();
