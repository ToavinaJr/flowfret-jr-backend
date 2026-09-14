import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis, { RedisOptions } from 'ioredis';
import { Observable } from 'rxjs';
import type { TranscriptionEvent } from './entities/transcription.types';
import {
  getRedisConnectionSummary,
  getRedisOptions,
} from '../common/redis-config';

@Injectable()
export class TranscriptionEvents implements OnModuleDestroy {
  private readonly logger = new Logger(TranscriptionEvents.name);
  private readonly publisher: Redis;
  private readonly options: RedisOptions;

  constructor(config: ConfigService) {
    this.options = getRedisOptions(config);
    this.logger.log(
      JSON.stringify({
        event: 'redis.configuration',
        ...getRedisConnectionSummary(this.options),
      }),
    );
    this.publisher = new Redis(this.options);
    this.publisher.on('error', (error) =>
      this.logger.error(
        JSON.stringify({
          event: 'redis.publisher_error',
          error: error.message,
        }),
      ),
    );
  }

  emit(event: TranscriptionEvent): void {
    void this.ensureConnected(this.publisher)
      .then(() =>
        this.publisher.publish(
          this.channel(event.transcriptionId),
          JSON.stringify(event),
        ),
      )
      .then((subscribers) =>
        this.logger.debug(
          JSON.stringify({
            event: 'transcription.event_published',
            transcriptionId: event.transcriptionId,
            type: event.type,
            subscribers,
          }),
        ),
      )
      .catch((error: unknown) =>
        this.logger.error(
          JSON.stringify({
            event: 'transcription.event_publish_failed',
            transcriptionId: event.transcriptionId,
            type: event.type,
            error: error instanceof Error ? error.message : String(error),
          }),
        ),
      );
  }

  subscribe(
    transcriptionId: string,
    getInitial: () => Promise<TranscriptionEvent>,
  ): Observable<TranscriptionEvent> {
    return new Observable<TranscriptionEvent>((subscriber) => {
      const redis = new Redis(this.options);
      redis.on('error', (error) => subscriber.error(error));
      let initialSent = false;
      let closed = false;
      const bufferedEvents: TranscriptionEvent[] = [];
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
          if (!initialSent) {
            bufferedEvents.push(event);
            return;
          }
          subscriber.next(event);
          if (this.isTerminal(event)) subscriber.complete();
        } catch {
          subscriber.error(new Error('Invalid transcription event'));
        }
      });
      void this.ensureConnected(redis)
        .then(() => redis.subscribe(this.channel(transcriptionId)))
        .then(async () => {
          const initial = await getInitial();
          if (closed) return;
          this.logger.log(
            JSON.stringify({
              event: 'transcription.sse_opened',
              transcriptionId,
              initialType: initial.type,
            }),
          );
          subscriber.next(initial);
          initialSent = true;
          if (this.isTerminal(initial)) {
            subscriber.complete();
            return;
          }
          for (const event of bufferedEvents) {
            subscriber.next(event);
            if (this.isTerminal(event)) {
              subscriber.complete();
              break;
            }
          }
        })
        .catch((error: unknown) => subscriber.error(error));
      return () => {
        closed = true;
        this.logger.log(
          JSON.stringify({
            event: 'transcription.sse_closed',
            transcriptionId,
          }),
        );
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
