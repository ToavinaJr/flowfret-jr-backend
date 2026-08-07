import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor() {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      throw new Error(
        'DATABASE_URL is missing. Set it in .env.development (or .env).',
      );
    }

    const databaseTimeoutMs = Number(
      process.env.TRANSCRIPTION_DATABASE_TIMEOUT_MS ?? 15_000,
    );
    super({
      adapter: new PrismaPg({
        connectionString: databaseUrl,
        max: Number(process.env.DATABASE_POOL_MAX ?? 5),
        connectionTimeoutMillis: databaseTimeoutMs,
        idleTimeoutMillis: 30_000,
        query_timeout: databaseTimeoutMs,
        statement_timeout: databaseTimeoutMs,
        keepAlive: true,
      }),
    });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
