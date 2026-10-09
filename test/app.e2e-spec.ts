import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { GraphQLSchemaHost } from '@nestjs/graphql';
import { PrismaService } from './../src/prisma/prisma.service';
import { AuthService } from './../src/auth/auth.service';

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
  let app: INestApplication<App>;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
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
      const responseCookie = cookiePair(
        refreshResponse.headers as Record<string, unknown>,
      );
      expect(responseCookie).toMatch(/^fretflow_refresh=.+/);
      refreshCookie = responseCookie as string;
      const refreshAttributes = cookieHeader(
        refreshResponse.headers as Record<string, unknown>,
      );
      expect(refreshAttributes).toMatch(/Max-Age=\d+/i);
      expect(refreshAttributes).toMatch(/Path=\/graphql/i);
      expect(refreshAttributes).toMatch(/HttpOnly/i);

      const logoutResponse = await request(app.getHttpServer())
        .post('/graphql')
        .set('Cookie', refreshCookie)
        .send({ query: LOGOUT_QUERY })
        .expect(200);
      const logoutBody = logoutResponse.body as GraphQLBody<{ logout: boolean }>;
      expect(logoutBody.data?.logout).toBe(true);

      const revokedRefreshResponse = await request(app.getHttpServer())
        .post('/graphql')
        .set('Cookie', refreshCookie)
        .send({ query: REFRESH_QUERY })
        .expect(200);
      const revokedRefreshBody = revokedRefreshResponse.body as GraphQLBody<unknown>;
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

  afterAll(async () => {
    await app.close();
  });
});
