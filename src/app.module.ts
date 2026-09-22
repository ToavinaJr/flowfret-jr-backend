import { ApolloDriver, ApolloDriverConfig } from '@nestjs/apollo';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Module } from '@nestjs/common';
import { GraphQLModule } from '@nestjs/graphql';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuditLogsResolver } from './audit-logs/audit-logs.resolver';
import { CommentsResolver } from './comments/comments.resolver';
import { FriendshipsResolver } from './friendships/friendships.resolver';
import { PrismaModule } from './prisma/prisma.module';
import { AppResolver } from './app.resolver';
import { PostInteractionsResolver } from './post-interactions/post-interactions.resolver';
import { PostAttachmentsResolver } from './post-interactions/post-interactions.resolver';
import { PostReportsResolver } from './post-interactions/post-interactions.resolver';
import { AuthModule } from './auth/auth.module';
import { ProfilesResolver } from './profiles/profiles.resolver';
import { PostsResolver } from './posts/posts.resolver';
import { NotificationsResolver } from './notifications/notifications.resolver';
import { UsersResolver } from './users/users.resolver';
import { formatGraphQLError } from './common/format-graphql-error';
import { MusicModule } from './integrations/music/music.module';
import { TranscriptionsModule } from './transcriptions/transcriptions.module';
import { validateEnvironment } from './common/validate-environment';
import { UploadsModule } from './uploads/uploads.module';
import { LyricsModule } from './integrations/lyrics/lyrics.module';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { Request, Response } from 'express';
import { AuditInterceptor } from './audit-logs/audit.interceptor';
import { NotificationsService } from './notifications/notifications.service';
import { createGraphqlSecurityRule } from './common/graphql-security';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnvironment,
      envFilePath: [
        `.env.${process.env.NODE_ENV ?? 'development'}.local`,
        `.env.${process.env.NODE_ENV ?? 'development'}`,
        '.env.local',
        '.env',
      ],
    }),
    PrismaModule,
    AuthModule,
    MusicModule,
    TranscriptionsModule,
    LyricsModule,
    UploadsModule,
    GraphQLModule.forRootAsync<ApolloDriverConfig>({
      driver: ApolloDriver,
      inject: [ConfigService],
      useFactory: (config: ConfigService): ApolloDriverConfig => ({
        driver: ApolloDriver,
        autoSchemaFile: true,
        sortSchema: true,
        introspection: config.get<string>('NODE_ENV') !== 'production',
        allowBatchedHttpRequests: false,
        csrfPrevention: true,
        includeStacktraceInErrorResponses: false,
        validationRules: [
          createGraphqlSecurityRule({
            maxDepth: positiveConfig(config, 'GRAPHQL_MAX_DEPTH', 12),
            maxFields: positiveConfig(config, 'GRAPHQL_MAX_FIELDS', 300),
            maxAliases: positiveConfig(config, 'GRAPHQL_MAX_ALIASES', 30),
          }),
        ],
        context: ({ req, res }: { req: Request; res: Response }) => ({
          req,
          res,
        }),
        formatError: formatGraphQLError,
      }),
    }),
  ],
  controllers: [AppController],
  providers: [
    AppService,
    AppResolver,
    UsersResolver,
    ProfilesResolver,
    PostsResolver,
    CommentsResolver,
    FriendshipsResolver,
    NotificationsResolver,
    NotificationsService,
    AuditLogsResolver,
    PostInteractionsResolver,
    PostReportsResolver,
    PostAttachmentsResolver,
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
  ],
})
export class AppModule {}

function positiveConfig(
  config: ConfigService,
  key: string,
  fallback: number,
): number {
  const value = Number(config.get(key));
  return Number.isInteger(value) && value > 0 ? value : fallback;
}
