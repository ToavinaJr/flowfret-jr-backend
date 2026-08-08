import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule);
  app.enableShutdownHooks();
  app.enableCors({
    origin: true,
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
