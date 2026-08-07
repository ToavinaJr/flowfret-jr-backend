import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis, { RedisOptions } from 'ioredis';
import { Observable } from 'rxjs';
import type { TranscriptionEvent } from './entities/transcription.types';

@Injectable()
export class TranscriptionEvents implements OnModuleDestroy {
  private readonly publisher: Redis;
  private readonly options: RedisOptions;

  constructor(config: ConfigService) {
    this.options = {
      host: config.get<string>('REDIS_HOST') ?? 'localhost',
      port: Number(config.get('REDIS_PORT') ?? 6379),
      username: config.get<string>('REDIS_USERNAME') || undefined,
      password: config.get<string>('REDIS_PASSWORD') || undefined,
      tls: config.get<string>('REDIS_TLS') === 'true' ? {} : undefined,
      maxRetriesPerRequest: null,
      lazyConnect: true,
    };
    this.publisher = new Redis(this.options);
    this.publisher.on('error', () => undefined);
  }

  emit(event: TranscriptionEvent): void {
    void this.ensureConnected(this.publisher)
      .then(() =>
        this.publisher.publish(
          this.channel(event.transcriptionId),
          JSON.stringify(event),
        ),
      )
      .catch(() => undefined);
  }

  subscribe(
    transcriptionId: string,
    initial: TranscriptionEvent,
  ): Observable<TranscriptionEvent> {
    return new Observable<TranscriptionEvent>((subscriber) => {
      subscriber.next(initial);
      if (this.isTerminal(initial)) {
        subscriber.complete();
        return undefined;
      }
      const redis = new Redis(this.options);
      redis.on('error', (error) => subscriber.error(error));
      const heartbeat = setInterval(
        () =>
          subscriber.next({
            type: 'transcription.heartbeat',
            transcriptionId,
            timestamp: new Date().toISOString(),
          }),
        15_000,
      );
      redis.on('message', (_channel, payload) => {
        try {
          const event = JSON.parse(payload) as TranscriptionEvent;
          subscriber.next(event);
          if (this.isTerminal(event)) subscriber.complete();
        } catch {
          subscriber.error(new Error('Invalid transcription event'));
        }
      });
      void this.ensureConnected(redis)
        .then(() => redis.subscribe(this.channel(transcriptionId)))
        .catch((error: unknown) => subscriber.error(error));
      return () => {
        clearInterval(heartbeat);
        void redis
          .unsubscribe(this.channel(transcriptionId))
          .finally(() => redis.quit());
      };
    });
  }

  async onModuleDestroy(): Promise<void> {
    if (this.publisher.status !== 'end') await this.publisher.quit();
  }
  private channel(id: string): string {
    return `transcriptions:${id}:events`;
  }
  private isTerminal(event: TranscriptionEvent): boolean {
    return (
      event.type === 'transcription.completed' ||
      event.type === 'transcription.failed'
    );
  }
  private async ensureConnected(redis: Redis): Promise<void> {
    if (redis.status === 'wait') await redis.connect();
  }
}
