import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './../src/app.module';
import { GraphQLSchemaHost } from '@nestjs/graphql';
import { PrismaService } from './../src/prisma/prisma.service';
import { AuthService } from './../src/auth/auth.service';
import { assertUserStorageQuota } from './../src/uploads/user-storage-quota';
import {
  ConversationParticipantRole,
  ConversationType,
  FriendshipStatus,
  UserStatus,
} from '@prisma/client';
import { ChatService } from './../src/chat/chat.service';

type GraphQLBody<TData> = {
  data?: TData;
  errors?: Array<{ message: string; extensions?: { code?: string } }>;
};

const REFRESH_QUERY = `
  mutation RefreshSession {
    refreshSession { accessToken user { id email username role } }
  }
`;

const LOGOUT_QUERY = `mutation Logout { logout }`;

const PROTECTED_HISTORY_QUERY = `
  query MyListeningHistory {
    myListeningHistory(take: 1) { id }
  }
`;

const PROTECTED_CHAT_QUERY = `query MyConversations { myConversations { id } }`;
const PROTECTED_MUSIC_QUERY = `query MyFavoriteMusic { myFavoriteMusic { id } }`;
const ADMIN_UPLOADS_QUERY = `query Uploads { uploads { id } }`;

const ADMIN_USERS_QUERY = `
  query AdminUsers {
    adminUsers { totalCount }
  }
`;

const USER_QUERY = `
  query User($id: String!) {
    user(id: $id) { id email }
  }
`;

const ALIAS_ABUSE_QUERY = `{ ${Array.from(
  { length: 31 },
  (_, index) => `alias${index}: dbHealth`,
).join(' ')} }`;

const DEPTH_ABUSE_QUERY = `
  {
    user(id: "00000000-0000-4000-8000-000000000000") {
      authoredPosts {
        author {
          authoredPosts {
            author {
              authoredPosts {
                author {
                  authoredPosts {
                    author {
                      authoredPosts { author { authoredPosts { author { id } } } }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
`;

function cookiePair(headers: Record<string, unknown>): string | undefined {
  const value = headers['set-cookie'];
  const cookie = Array.isArray(value)
    ? value.find((entry): entry is string => typeof entry === 'string')
    : typeof value === 'string'
      ? value
      : undefined;
  return cookie?.split(';')[0];
}

function cookieHeader(headers: Record<string, unknown>): string {
  const value = headers['set-cookie'];
  if (Array.isArray(value)) return value.join(';');
  return typeof value === 'string' ? value : '';
}

describe('AppController (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication<NestExpressApplication>();
    // Expected HTTP failures (for example oversized request bodies) are asserted
    // by the e2e tests; keep Nest's exception logger from printing them as errors.
    app.useLogger(false);
    app.useBodyParser('json', { limit: '64kb' });
    await app.init();
    prisma = app.get(PrismaService);
  });

  it('/ (GET)', () => {
    return request(app.getHttpServer())
      .get('/')
      .expect(200)
      .expect('Hello World!');
  });

  it('/graphql exposes database health', () => {
    return request(app.getHttpServer())
      .post('/graphql')
      .send({ query: '{ dbHealth }' })
      .expect(200)
      .expect(({ body }: { body: { data?: { dbHealth?: string } } }) => {
        expect(body.data?.dbHealth).toBe('ok');
      });
  });

  it('preserves the public GraphQL operation contract', () => {
    const schema = app.get(GraphQLSchemaHost).schema;
    const queries = Object.keys(schema.getQueryType()?.getFields() ?? {});
    const mutations = Object.keys(schema.getMutationType()?.getFields() ?? {});

    expect(queries).toEqual(
      expect.arrayContaining([
        'posts',
        'post',
        'comments',
        'commentsByPost',
        'searchUsers',
        'myFriendships',
        'postLikes',
        'postReports',
        'profiles',
        'user',
        'myPlaylists',
        'playlist',
        'playlistItems',
      ]),
    );
    expect(mutations).toEqual(
      expect.arrayContaining([
        'register',
        'login',
        'loginWithGoogle',
        'registerWithGoogle',
        'verifyEmail',
        'refreshSession',
        'createPost',
        'updatePost',
        'deletePost',
        'createComment',
        'updateComment',
        'deleteComment',
        'sendFriendRequest',
        'respondFriendRequest',
        'likePost',
        'unlikePost',
        'reportPost',
        'updateMe',
        'createPlaylist',
        'updatePlaylist',
        'deletePlaylist',
        'addTrackToPlaylist',
        'removeTrackFromPlaylist',
        'reorderPlaylistItems',
      ]),
    );
  });

  it('rotates, clears, and revokes the refresh session cookie', async () => {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const email = `e2e-${suffix}@example.test`;
    const password = 'E2e-password-123!';
    const username = `e2e_${suffix}`;
    try {
      const session = await app.get(AuthService).register({
        email,
        password,
        username,
      });
      let refreshCookie = `fretflow_refresh=${session.refreshToken}`;

      const refreshResponse = await request(app.getHttpServer())
        .post('/graphql')
        .set('Cookie', refreshCookie)
        .send({ query: REFRESH_QUERY })
        .expect(200);
      const refreshBody = refreshResponse.body as GraphQLBody<{
        refreshSession: { accessToken: string; user: { email: string } };
      }>;
      expect(refreshBody.errors).toBeUndefined();
      expect(refreshBody.data?.refreshSession.user.email).toBe(email);
      expect(refreshBody.data?.refreshSession.accessToken).toEqual(
        expect.any(String),
      );
      const responseCookie = cookiePair(refreshResponse.headers);
      expect(responseCookie).toMatch(/^fretflow_refresh=.+/);
      refreshCookie = responseCookie as string;
      const refreshAttributes = cookieHeader(refreshResponse.headers);
      expect(refreshAttributes).toMatch(/Max-Age=\d+/i);
      expect(refreshAttributes).toMatch(/Path=\/graphql/i);
      expect(refreshAttributes).toMatch(/HttpOnly/i);

      const logoutResponse = await request(app.getHttpServer())
        .post('/graphql')
        .set('Cookie', refreshCookie)
        .send({ query: LOGOUT_QUERY })
        .expect(200);
      const logoutBody = logoutResponse.body as GraphQLBody<{
        logout: boolean;
      }>;
      expect(logoutBody.data?.logout).toBe(true);

      const revokedRefreshResponse = await request(app.getHttpServer())
        .post('/graphql')
        .set('Cookie', refreshCookie)
        .send({ query: REFRESH_QUERY })
        .expect(200);
      const revokedRefreshBody =
        revokedRefreshResponse.body as GraphQLBody<unknown>;
      expect(revokedRefreshBody.errors?.[0]).toMatchObject({
        extensions: { code: 'UNAUTHENTICATED' },
      });

      const afterLogoutResponse = await request(app.getHttpServer())
        .post('/graphql')
        .set('Cookie', refreshCookie)
        .send({ query: REFRESH_QUERY })
        .expect(200);
      const afterLogoutBody = afterLogoutResponse.body as GraphQLBody<{
        refreshSession?: unknown;
      }>;
      expect(afterLogoutBody.data?.refreshSession).toBeUndefined();
      expect(afterLogoutBody.errors?.[0]).toMatchObject({
        extensions: { code: 'UNAUTHENTICATED' },
      });
    } finally {
      await prisma.user.deleteMany({ where: { email } });
    }
  });

  it('rejects unauthenticated and non-admin access to protected GraphQL fields', async () => {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const email = `security-${suffix}@example.test`;
    const password = 'E2e-password-123!';
    const username = `security_${suffix}`;

    try {
      const anonymousResponse = await request(app.getHttpServer())
        .post('/graphql')
        .send({ query: PROTECTED_HISTORY_QUERY })
        .expect(200);
      const anonymousBody = anonymousResponse.body as GraphQLBody<unknown>;
      expect(anonymousBody.errors?.[0]).toMatchObject({
        extensions: { code: 'UNAUTHENTICATED' },
      });

      for (const query of [PROTECTED_CHAT_QUERY, PROTECTED_MUSIC_QUERY]) {
        const protectedResponse = await request(app.getHttpServer())
          .post('/graphql')
          .send({ query })
          .expect(200);
        const protectedBody = protectedResponse.body as GraphQLBody<unknown>;
        expect(protectedBody.errors?.[0]).toMatchObject({
          extensions: { code: 'UNAUTHENTICATED' },
        });
      }

      await request(app.getHttpServer())
        .post('/api/lyrics/report')
        .send({})
        .expect(401);

      const session = await app
        .get(AuthService)
        .register({ email, password, username });
      const accessToken = session.accessToken;

      const adminResponse = await request(app.getHttpServer())
        .post('/graphql')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ query: ADMIN_USERS_QUERY })
        .expect(200);
      const adminBody = adminResponse.body as GraphQLBody<unknown>;
      expect(adminBody.errors?.[0]).toMatchObject({
        extensions: { code: 'FORBIDDEN' },
      });

      const uploadsResponse = await request(app.getHttpServer())
        .post('/graphql')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ query: ADMIN_UPLOADS_QUERY })
        .expect(200);
      const uploadsBody = uploadsResponse.body as GraphQLBody<unknown>;
      expect(uploadsBody.errors?.[0]).toMatchObject({
        extensions: { code: 'FORBIDDEN' },
      });

      await request(app.getHttpServer())
        .get('/api/lyrics/reports')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(403);
    } finally {
      await prisma.user.deleteMany({ where: { email } });
    }
  });

  it('prevents horizontal access to another user private data', async () => {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const firstEmail = `idor-a-${suffix}@example.test`;
    const secondEmail = `idor-b-${suffix}@example.test`;
    const password = 'E2e-password-123!';
    const firstUsername = `idor_a_${suffix}`;
    const secondUsername = `idor_b_${suffix}`;

    try {
      const authService = app.get(AuthService);
      const first = await authService.register({
        email: firstEmail,
        password,
        username: firstUsername,
      });
      const second = await authService.register({
        email: secondEmail,
        password,
        username: secondUsername,
      });
      expect(first.accessToken).toEqual(expect.any(String));
      expect(second.user.id).toEqual(expect.any(String));

      const response = await request(app.getHttpServer())
        .post('/graphql')
        .set('Authorization', `Bearer ${first.accessToken}`)
        .send({ query: USER_QUERY, variables: { id: second.user.id } })
        .expect(200);
      const body = response.body as GraphQLBody<unknown>;
      expect(body.errors?.[0]).toMatchObject({
        extensions: { code: 'FORBIDDEN' },
      });
    } finally {
      await prisma.user.deleteMany({
        where: { email: { in: [firstEmail, secondEmail] } },
      });
    }
  });

  it('rejects GraphQL alias and depth abuse before resolver execution', async () => {
    const aliasResponse = await request(app.getHttpServer())
      .post('/graphql')
      .send({ query: ALIAS_ABUSE_QUERY })
      .expect(400);
    const aliasBody = aliasResponse.body as GraphQLBody<unknown>;
    expect(aliasBody.errors?.[0]?.message).toContain('alias count');

    const depthResponse = await request(app.getHttpServer())
      .post('/graphql')
      .send({ query: DEPTH_ABUSE_QUERY })
      .expect(400);
    const depthBody = depthResponse.body as GraphQLBody<unknown>;
    expect(depthBody.errors?.[0]?.message).toContain('query depth');
  });

  it('rejects anonymous multipart uploads before reading application data', async () => {
    const response = await request(app.getHttpServer())
      .post('/uploads/images')
      .attach('images', Buffer.from('not-an-image'), 'payload.jpg')
      .expect(401);

    const body = response.body as { message?: string };
    expect(body.message).toBe('Unauthorized');
  });

  it('rejects GraphQL JSON payloads above the configured body limit', async () => {
    const oversizedQuery = `{ dbHealth ${'x '.repeat(40_000)} }`;

    await request(app.getHttpServer())
      .post('/graphql')
      .send({ query: oversizedQuery })
      .expect(413);
  });

  it('serializes concurrent upload quota reservations against PostgreSQL', async () => {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const email = `quota-${suffix}@example.test`;
    const user = await app.get(AuthService).register({
      email,
      password: 'E2e-password-123!',
      username: `quota_${suffix}`,
    });

    try {
      const reserve = (name: string) =>
        prisma.$transaction(async (tx) => {
          await assertUserStorageQuota(tx, user.user.id, 7, 10);
          // Keep the first transaction open long enough for the second request
          // to contend on the same PostgreSQL advisory lock.
          await new Promise((resolve) => setTimeout(resolve, 50));
          await tx.upload.create({
            data: {
              userId: user.user.id,
              fileName: `${name}.wav`,
              fileType: 'audio/wav',
              fileSize: 7n,
              storagePath: `e2e/${suffix}/${name}.wav`,
            },
          });
        });

      const outcomes = await Promise.allSettled([
        reserve('first'),
        reserve('second'),
      ]);

      const reservationFailures = outcomes.flatMap((outcome) =>
        outcome.status === 'rejected'
          ? [
              outcome.reason instanceof Error
                ? outcome.reason.message
                : String(outcome.reason),
            ]
          : [],
      );
      expect(reservationFailures).toEqual([
        'The storage quota has been reached.',
      ]);
      expect(
        outcomes.filter(({ status }) => status === 'fulfilled'),
      ).toHaveLength(1);
      expect(
        outcomes.filter(({ status }) => status === 'rejected'),
      ).toHaveLength(1);
      const uploads = await prisma.upload.aggregate({
        where: { userId: user.user.id, isDeleted: false },
        _sum: { fileSize: true },
      });
      expect(uploads._sum.fileSize).toBe(7n);
    } finally {
      await prisma.user.delete({ where: { id: user.user.id } });
    }
  });

  it('serializes concurrent group invitations at the PostgreSQL member limit', async () => {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const emails: string[] = [];
    const createdUserIds: string[] = [];
    let conversationId: string | undefined;

    try {
      const users = await Promise.all(
        Array.from({ length: 51 }, (_, index) => {
          const email = `chat-${suffix}-${index}@example.test`;
          emails.push(email);
          return prisma.user.create({
            data: {
              email,
              username: `chat_${suffix.replaceAll('-', '_')}_${index}`,
              status: UserStatus.ACTIVE,
            },
            select: { id: true },
          });
        }),
      );
      createdUserIds.push(...users.map(({ id }) => id));
      const [ownerId, ...otherIds] = createdUserIds;
      const existingMemberIds = otherIds.slice(0, 48);
      const candidateIds = otherIds.slice(48);

      await prisma.friendship.createMany({
        data: candidateIds.map((receiverId) => ({
          requesterId: ownerId,
          receiverId,
          status: FriendshipStatus.ACCEPTED,
        })),
      });
      const conversation = await prisma.conversation.create({
        data: {
          type: ConversationType.GROUP,
          name: 'Concurrency test',
          creatorId: ownerId,
          participants: {
            create: [
              { userId: ownerId, role: ConversationParticipantRole.ADMIN },
              ...existingMemberIds.map((userId) => ({ userId })),
            ],
          },
        },
        select: { id: true },
      });
      conversationId = conversation.id;

      const outcomes = await Promise.allSettled(
        candidateIds.map((candidateId) =>
          app
            .get(ChatService)
            .addGroupMembers(ownerId, conversation.id, [candidateId]),
        ),
      );

      const invitationFailures = outcomes.flatMap((outcome) =>
        outcome.status === 'rejected'
          ? [
              outcome.reason instanceof Error
                ? outcome.reason.message
                : String(outcome.reason),
            ]
          : [],
      );
      expect(invitationFailures).toEqual(['A group is limited to 50 members.']);
      expect(
        outcomes.filter(({ status }) => status === 'fulfilled'),
      ).toHaveLength(1);
      expect(
        outcomes.filter(({ status }) => status === 'rejected'),
      ).toHaveLength(1);
      await expect(
        prisma.conversationParticipant.count({
          where: { conversationId: conversation.id, isDeleted: false },
        }),
      ).resolves.toBe(50);
    } finally {
      if (conversationId) {
        await prisma.conversation.deleteMany({ where: { id: conversationId } });
      }
      await prisma.user.deleteMany({ where: { email: { in: emails } } });
    }
  }, 20_000);

  afterAll(async () => {
    await app.close();
  });
});
