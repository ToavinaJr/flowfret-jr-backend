import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { GraphQLSchemaHost } from '@nestjs/graphql';

describe('AppController (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
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
        'createPostLike',
        'deletePostLike',
      ]),
    );
  });

  afterAll(async () => {
    await app.close();
  });
});
