import { ConfigService } from '@nestjs/config';
import { InternalServerErrorException } from '@nestjs/common';

export function getRequiredConfig(
  configService: ConfigService,
  key: string,
): string {
  const value = configService.get<string>(key)?.trim();
  if (!value) {
    throw new InternalServerErrorException(
      `Missing required configuration: ${key}. Configure it in your .env.development.local or .env file before starting the transcription worker.`,
    );
  }
  return value;
}
