import { ConfigService } from '@nestjs/config';

const DEVELOPMENT_ORIGINS = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:8080',
  'http://127.0.0.1:8080',
] as const;

export function getAllowedOrigins(config: ConfigService): ReadonlySet<string> {
  const production = config.get<string>('NODE_ENV') === 'production';
  const port = config.get<string>('PORT') ?? '3000';
  const configured = [
    config.get<string>('APP_URL'),
    ...(config.get<string>('CORS_ORIGINS') ?? '').split(','),
    ...(production
      ? []
      : [
          `http://localhost:${port}`,
          `http://127.0.0.1:${port}`,
          ...DEVELOPMENT_ORIGINS,
        ]),
  ];

  return new Set(
    configured
      .map((value) => value?.trim())
      .filter((value): value is string => Boolean(value))
      .map((value) => {
        try {
          return new URL(value).origin;
        } catch {
          throw new Error('CORS configuration contains an invalid URL.');
        }
      }),
  );
}
