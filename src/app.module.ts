import { ApolloDriver, ApolloDriverConfig } from '@nestjs/apollo';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Module } from '@nestjs/common';
import { GraphQLModule } from '@nestjs/graphql';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { AppResolver } from './app.resolver';
import { AuthModule } from './auth/auth.module';
import { formatGraphQLError } from './common/format-graphql-error';
import { MusicModule } from './integrations/music/music.module';
import { TranscriptionsModule } from './transcriptions/transcriptions.module';
import { validateEnvironment } from './common/validate-environment';
import { UploadsModule } from './uploads/uploads.module';
import { LyricsModule } from './integrations/lyrics/lyrics.module';
import { Request, Response } from 'express';
import { createGraphqlSecurityRule } from './common/graphql-security';
import { SocialModule } from './social/social.module';
import { PlaylistsModule } from './playlists/playlists.module';

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
    SocialModule,
    PlaylistsModule,
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
            maxComplexity: positiveConfig(
              config,
              'GRAPHQL_MAX_COMPLEXITY',
              200,
            ),
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
  providers: [AppService, AppResolver],
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
