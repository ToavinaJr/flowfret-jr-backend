import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule);
  app.enableShutdownHooks();
  const allowedOrigins = new Set(
    [
      process.env.APP_URL,
      ...(process.env.CORS_ORIGINS ?? '').split(','),
      ...(process.env.NODE_ENV === 'production'
        ? []
        : ['http://localhost:5173']),
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
      return callback(new Error(`Origin not allowed by CORS: ${origin}`), false);
    },
    credentials: true,
  });
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );

  const rawPort = process.env.PORT;
  const port = rawPort ? Number(rawPort) : 3000;

  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error(`Invalid PORT value: ${rawPort ?? '<empty>'}`);
  }

  await app.listen(port);
  logger.log(
    `Backend listening on port ${port}; DEBUG=${process.env.DEBUG ?? 'false'}`,
  );
}
void bootstrap();
