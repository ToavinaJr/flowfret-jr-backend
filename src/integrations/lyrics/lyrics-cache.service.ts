import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { getRedisOptions } from '../../common/redis-config';
import type { Lyrics } from './interfaces/lyrics.interface';

@Injectable()
export class LyricsCacheService implements OnModuleDestroy {
  private readonly logger = new Logger(LyricsCacheService.name);
  private readonly redis: Redis;

  constructor(config: ConfigService) {
    this.redis = new Redis({
      ...getRedisOptions(config),
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
    });
    this.redis.on('error', (error) =>
      this.logger.warn(`Lyrics cache unavailable: ${error.message}`),
    );
    void this.redis.connect().catch(() => undefined);
  }

  async get(key: string): Promise<Lyrics | null | undefined> {
    try {
      const value = await this.redis.get(key);
      if (value === null) return undefined;
      if (value === 'NOT_FOUND') return null;
      return JSON.parse(value) as Lyrics;
    } catch {
      return undefined;
    }
  }

  async set(
    key: string,
    value: Lyrics | null,
    ttlSeconds: number,
  ): Promise<void> {
    try {
      await this.redis.set(
        key,
        value === null ? 'NOT_FOUND' : JSON.stringify(value),
        'EX',
        ttlSeconds,
      );
    } catch {
      // Lyrics remain optional when Redis is temporarily unavailable.
    }
  }

  onModuleDestroy(): void {
    this.redis.disconnect();
  }
}
