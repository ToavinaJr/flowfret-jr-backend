import type { NestExpressApplication } from '@nestjs/platform-express';
import type { ConfigService } from '@nestjs/config';
import helmet from 'helmet';
import { getAllowedOrigins } from './cors-origins';

export function configureHttpSecurity(
  app: NestExpressApplication,
  config: ConfigService,
): void {
  app.use(helmet());

  if (config.get<string>('NODE_ENV') === 'production') {
    app.set('trust proxy', 1);
  }

  const allowedOrigins = getAllowedOrigins(config);
  app.enableCors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.has(origin)) return callback(null, true);
      return callback(new Error('Origin not allowed by CORS.'), false);
    },
    credentials: true,
    exposedHeaders: ['X-Chord-Diagnostic-Id'],
  });
}
