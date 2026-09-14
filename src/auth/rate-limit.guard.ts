import {
  CanActivate,
  ExecutionContext,
  HttpException,
  Injectable,
  Logger,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { GqlExecutionContext } from '@nestjs/graphql';
import { createHash } from 'crypto';
import Redis from 'ioredis';
import { getRedisOptions } from '../common/redis-config';
import { RATE_LIMIT_KEY, RateLimitOptions } from './rate-limit.decorator';

type RateLimitRequest = {
  ip?: string;
  user?: { sub?: string };
};

@Injectable()
export class RateLimitGuard implements CanActivate, OnModuleDestroy {
  private readonly logger = new Logger(RateLimitGuard.name);
  private readonly redis: Redis;

  constructor(
    private readonly reflector: Reflector,
    config: ConfigService,
  ) {
    this.redis = new Redis(getRedisOptions(config));
    this.redis.on('error', (error) =>
      this.logger.error(`Rate-limit Redis error: ${error.message}`),
    );
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const options = this.reflector.getAllAndOverride<RateLimitOptions>(
      RATE_LIMIT_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!options) return true;
    const request = this.request(context);
    const identity = request.user?.sub ?? request.ip ?? 'unknown';
    const digest = createHash('sha256')
      .update(
        `${context.getClass().name}:${context.getHandler().name}:${identity}`,
      )
      .digest('hex');
    try {
      if (this.redis.status === 'wait') await this.redis.connect();
      const count = Number(
        await this.redis.eval(
          "local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('EXPIRE',KEYS[1],ARGV[1]); end; return n",
          1,
          `rate-limit:${digest}`,
          String(options.windowSeconds),
        ),
      );
      if (count > options.limit) {
        throw new HttpException('Trop de requêtes. Réessayez plus tard.', 429);
      }
    } catch (error) {
      if (error instanceof HttpException) throw error;
      // A Redis outage must not turn into a complete authentication outage.
      this.logger.error(
        `Rate-limit check unavailable: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    return true;
  }

  async onModuleDestroy(): Promise<void> {
    if (this.redis.status !== 'end') await this.redis.quit();
  }

  private request(context: ExecutionContext): RateLimitRequest {
    if (context.getType<string>() === 'http') {
      return context.switchToHttp().getRequest<RateLimitRequest>();
    }
    return GqlExecutionContext.create(context).getContext<{
      req: RateLimitRequest;
    }>().req;
  }
}
