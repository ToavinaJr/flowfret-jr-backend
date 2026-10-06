import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import sgMail from '@sendgrid/mail';
import { MailService } from './mail.service';

describe('MailService', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('never logs OTP or password-reset secrets when delivery is disabled', async () => {
    const warning = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    const service = new MailService({
      get: jest.fn(() => undefined),
    } as unknown as ConfigService);

    await service.sendOtpVerificationEmail({
      to: 'private@example.com',
      username: 'private-user',
      otpCode: '1234',
      verificationLink: 'https://example.com/verify?token=secret-token',
      expiresInMinutes: 15,
    });
    await service.sendPasswordResetEmail({
      to: 'private@example.com',
      username: 'private-user',
      resetLink: 'https://example.com/reset?token=reset-secret',
      expiresInMinutes: 60,
    });

    const output = JSON.stringify(warning.mock.calls);
    expect(output).not.toContain('private@example.com');
    expect(output).not.toContain('1234');
    expect(output).not.toContain('secret-token');
    expect(output).not.toContain('reset-secret');
    warning.mockRestore();
  });

  it('sends OTP and password-reset messages through SendGrid', async () => {
    const send = jest
      .spyOn(sgMail, 'send')
      .mockResolvedValue([{} as never, {}]);
    const setApiKey = jest.spyOn(sgMail, 'setApiKey').mockImplementation();
    const values: Record<string, string> = {
      SENDGRID_API_KEY: 'sendgrid-test-key',
      SENDGRID_FROM_EMAIL: 'noreply@flowfret.app',
    };
    const service = new MailService({
      get: jest.fn((key: string) => values[key]),
    } as unknown as ConfigService);

    expect(setApiKey).toHaveBeenCalledWith('sendgrid-test-key');

    await service.sendOtpVerificationEmail({
      to: 'private@example.com',
      username: 'private-user',
      otpCode: '1234',
      verificationLink: 'https://example.com/verify?token=secret-token',
      expiresInMinutes: 15,
    });
    await service.sendPasswordResetEmail({
      to: 'private@example.com',
      username: 'private-user',
      resetLink: 'https://example.com/reset?token=reset-secret',
      expiresInMinutes: 60,
    });

    expect(send).toHaveBeenCalledTimes(2);
    expect(send).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        to: 'private@example.com',
        from: { email: 'noreply@flowfret.app', name: 'FlowFret' },
        subject: 'FlowFret — Vérifiez votre compte',
      }),
    );
    expect(send).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        to: 'private@example.com',
        from: { email: 'noreply@flowfret.app', name: 'FlowFret' },
        subject: 'FlowFret — Réinitialisez votre mot de passe',
      }),
    );
  });
});
