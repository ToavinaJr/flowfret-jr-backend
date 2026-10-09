import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { GraphQLSchemaHost } from '@nestjs/graphql';
import { PrismaService } from './../src/prisma/prisma.service';

type GraphQLBody<TData> = {
  data?: TData;
  errors?: Array<{ message: string; extensions?: { code?: string } }>;
};

const AUTH_QUERY = `
  mutation Register($data: RegisterInput!) {
    register(data: $data) {
      accessToken
      user { id email username role }
    }
  }
`;

const REFRESH_QUERY = `
  mutation RefreshSession {
    refreshSession { accessToken user { id email username role } }
  }
`;

const LOGIN_QUERY = `
  mutation Login($data: LoginInput!) {
    login(data: $data) {
      accessToken
      user { id email username role }
    }
  }
`;

const LOGOUT_QUERY = `mutation Logout { logout }`;

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
    const client = request.agent(app.getHttpServer());

    try {
      const registerResponse = await client
        .post('/graphql')
        .send({
          query: AUTH_QUERY,
          variables: { data: { email, password, username } },
        })
        .expect(200);
      const registerBody = registerResponse.body as GraphQLBody<{
        register: { accessToken: string; user: { email: string } };
      }>;

      expect(registerBody.errors).toBeUndefined();
      expect(registerBody.data?.register.user.email).toBe(email);
      expect(registerBody.data?.register.accessToken).toEqual(expect.any(String));
      const registerSetCookie = registerResponse.headers['set-cookie'];
      const setCookie = Array.isArray(registerSetCookie)
        ? registerSetCookie
        : [registerSetCookie];
      const refreshCookie = setCookie.join(';');
      expect(refreshCookie).toMatch(/fretflow_refresh=[^;]+/i);
      expect(refreshCookie).toMatch(/Max-Age=\d+/i);
      expect(refreshCookie).toMatch(/Path=\/graphql/i);
      expect(refreshCookie).toMatch(/HttpOnly/i);

      const refreshResponse = await client
        .post('/graphql')
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
      const refreshSetCookie: unknown = (
        refreshResponse.headers as Record<string, unknown>
      )['set-cookie'];
      const refreshCookieValue = Array.isArray(refreshSetCookie)
        ? refreshSetCookie.find((value): value is string => typeof value === 'string')
        : typeof refreshSetCookie === 'string'
          ? refreshSetCookie
          : undefined;
      const rotatedCookie = refreshCookieValue?.split(';')[0];
      expect(rotatedCookie).toMatch(/^fretflow_refresh=.+/);

      const logoutResponse = await client
        .post('/graphql')
        .send({ query: LOGOUT_QUERY })
        .expect(200);
      const logoutBody = logoutResponse.body as GraphQLBody<{ logout: boolean }>;
      expect(logoutBody.data?.logout).toBe(true);

      const revokedRefreshResponse = await request(app.getHttpServer())
        .post('/graphql')
        .set('Cookie', rotatedCookie as string)
        .send({ query: REFRESH_QUERY })
        .expect(200);
      const revokedRefreshBody = revokedRefreshResponse.body as GraphQLBody<unknown>;
      expect(revokedRefreshBody.errors?.[0]).toMatchObject({
        extensions: { code: 'UNAUTHENTICATED' },
      });

      const loginResponse = await client
        .post('/graphql')
        .send({ query: LOGIN_QUERY, variables: { data: { email, password } } })
        .expect(200);
      const loginBody = loginResponse.body as GraphQLBody<{
        login: { accessToken: string; user: { email: string } };
      }>;
      expect(loginBody.errors).toBeUndefined();
      expect(loginBody.data?.login.user.email).toBe(email);

      const postLoginRefresh = await client
        .post('/graphql')
        .send({ query: REFRESH_QUERY })
        .expect(200);
      const postLoginRefreshBody = postLoginRefresh.body as GraphQLBody<{
        refreshSession: { user: { email: string } };
      }>;
      expect(postLoginRefreshBody.data?.refreshSession.user.email).toBe(email);

      await client
        .post('/graphql')
        .send({ query: LOGOUT_QUERY })
        .expect(200);

      const afterLogoutResponse = await client
        .post('/graphql')
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

  afterAll(async () => {
    await app.close();
  });
});
