import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { ConfigService } from '@nestjs/config';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const config = app.get(ConfigService);
  const bodyLimitKb = positiveInteger(
    config.get<string>('GRAPHQL_BODY_LIMIT_KB'),
    64,
  );
  app.useBodyParser('json', { limit: `${bodyLimitKb}kb` });
  app.use(helmet());
  const production = config.get<string>('NODE_ENV') === 'production';
  if (production) app.set('trust proxy', 1);
  app.enableShutdownHooks();
  const port = positiveInteger(config.get<string>('PORT'), 3000);
  if (port > 65535) throw new Error('PORT must be between 1 and 65535.');

  const allowedOrigins = new Set(
    [
      config.get<string>('APP_URL'),
      ...(config.get<string>('CORS_ORIGINS') ?? '').split(','),
      ...(production
        ? []
        : [
            `http://localhost:${port}`,
            `http://127.0.0.1:${port}`,
            'http://localhost:5173',
            'http://127.0.0.1:5173',
            'http://localhost:8080',
            'http://127.0.0.1:8080',
          ]),
    ]
      .map((value) => value?.trim())
      .filter((value): value is string => Boolean(value))
      .map((value) => {
        try {
          return new URL(value).origin;
        } catch {
          throw new Error(`Invalid CORS origin: ${value}`);
        }
      }),
  );
  app.enableCors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.has(origin)) return callback(null, true);
      return callback(
        new Error(`Origin not allowed by CORS: ${origin}`),
        false,
      );
    },
    credentials: true,
    exposedHeaders: ['X-Chord-Diagnostic-Id'],
  });
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
