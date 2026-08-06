import { ApolloDriver, ApolloDriverConfig } from '@nestjs/apollo';
import { ConfigModule } from '@nestjs/config';
import { Module } from '@nestjs/common';
import { GraphQLModule } from '@nestjs/graphql';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuditLogsResolver } from './audit-logs/audit-logs.resolver';
import { AuthTokensResolver } from './auth-tokens/auth-tokens.resolver';
import { CommentsResolver } from './comments/comments.resolver';
import { FriendshipsResolver } from './friendships/friendships.resolver';
import { PrismaModule } from './prisma/prisma.module';
import { AppResolver } from './app.resolver';
import { PasswordResetTokensResolver } from './auth-tokens/auth-tokens.resolver';
import { PostInteractionsResolver } from './post-interactions/post-interactions.resolver';
import { PostAttachmentsResolver } from './post-interactions/post-interactions.resolver';
import { PostReportsResolver } from './post-interactions/post-interactions.resolver';
import { PostTagsResolver } from './post-tags/post-tags.resolver';
import { AuthModule } from './auth/auth.module';
import { ProfilesResolver } from './profiles/profiles.resolver';
import { PostsResolver } from './posts/posts.resolver';
import { NotificationsResolver } from './notifications/notifications.resolver';
import { UploadsResolver } from './uploads/uploads.resolver';
import { TagsResolver } from './tags/tags.resolver';
import { UsersResolver } from './users/users.resolver';
import { formatGraphQLError } from './common/format-graphql-error';
import { MusicModule } from './integrations/music/music.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
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
    GraphQLModule.forRoot<ApolloDriverConfig>({
      driver: ApolloDriver,
      autoSchemaFile: true,
      sortSchema: true,
      context: ({ req }) => ({ req }),
      formatError: formatGraphQLError,
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
    UploadsResolver,
    NotificationsResolver,
    AuditLogsResolver,
    AuthTokensResolver,
    PasswordResetTokensResolver,
    PostInteractionsResolver,
    PostReportsResolver,
    PostAttachmentsResolver,
    PostTagsResolver,
    TagsResolver,
  ],
})
export class AppModule {}
