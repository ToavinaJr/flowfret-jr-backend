import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { Request, Response } from 'express';
import request from 'supertest';
import { configureHttpSecurity } from './http-security';

@Module({})
class EmptyModule {}

describe('configureHttpSecurity', () => {
  let app: NestExpressApplication;

  afterEach(async () => {
    await app?.close();
  });

  it('sets Helmet headers and allows only configured credentialed origins', async () => {
    app = await NestFactory.create<NestExpressApplication>(EmptyModule, {
      logger: false,
    });
    const config = new ConfigService({
      NODE_ENV: 'production',
      APP_URL: 'https://app.flowfret.test',
      CORS_ORIGINS: 'https://www.flowfret.test',
    });
    configureHttpSecurity(app, config);
    app.use('/probe', (_request: Request, response: Response) =>
      response.sendStatus(200),
    );
    await app.init();

    const allowedResponse = await request(app.getHttpServer())
      .get('/probe')
      .set('Origin', 'https://www.flowfret.test')
      .set('X-Forwarded-Proto', 'https')
      .expect(200);

    expect(allowedResponse.headers['access-control-allow-origin']).toBe(
      'https://www.flowfret.test',
    );
    expect(allowedResponse.headers['access-control-allow-credentials']).toBe(
      'true',
    );
    expect(allowedResponse.headers['content-security-policy']).toContain(
      "default-src 'self'",
    );
    expect(allowedResponse.headers['x-content-type-options']).toBe('nosniff');
    expect(allowedResponse.headers['strict-transport-security']).toContain(
      'max-age=',
    );

    const rejectedResponse = await request(app.getHttpServer())
      .get('/probe')
      .set('Origin', 'https://attacker.test')
      .set('X-Forwarded-Proto', 'https');

    expect(
      rejectedResponse.headers['access-control-allow-origin'],
    ).toBeUndefined();
  });

  it('does not add development origins to the production allow-list', async () => {
    app = await NestFactory.create<NestExpressApplication>(EmptyModule, {
      logger: false,
    });
    configureHttpSecurity(
      app,
      new ConfigService({
        NODE_ENV: 'production',
        APP_URL: 'https://app.flowfret.test',
      }),
    );
    app.use('/probe', (_request: Request, response: Response) =>
      response.sendStatus(200),
    );
    await app.init();

    const response = await request(app.getHttpServer())
      .get('/probe')
      .set('Origin', 'http://localhost:8080');

    expect(response.headers['access-control-allow-origin']).toBeUndefined();
  });
});
