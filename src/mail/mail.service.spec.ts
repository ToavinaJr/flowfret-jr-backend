import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer, { type Transporter } from 'nodemailer';
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

  it('sends OTP and password-reset messages through Gmail SMTP', async () => {
    const sendMail = jest.fn().mockResolvedValue({ messageId: 'sent' });
    const createTransport = jest
      .spyOn(nodemailer, 'createTransport')
      .mockReturnValue({ sendMail } as unknown as Transporter);
    const values: Record<string, string> = {
      SMTP_USER: 'mailer@gmail.com',
      SMTP_PASSWORD: 'google-app-password',
      SMTP_FROM_EMAIL: 'mailer@gmail.com',
      SMTP_PORT: '465',
    };
    const service = new MailService({
      get: jest.fn((key: string) => values[key]),
    } as unknown as ConfigService);

    expect(createTransport).toHaveBeenCalledWith({
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,
      auth: { user: 'mailer@gmail.com', pass: 'google-app-password' },
    });

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

    expect(sendMail).toHaveBeenCalledTimes(2);
    expect(sendMail).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        to: 'private@example.com',
        from: { address: 'mailer@gmail.com', name: 'FlowFret' },
        subject: 'FlowFret — Vérifiez votre compte',
      }),
    );
    expect(sendMail).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        to: 'private@example.com',
        from: { address: 'mailer@gmail.com', name: 'FlowFret' },
        subject: 'FlowFret — Réinitialisez votre mot de passe',
      }),
    );
  });

  it('uses STARTTLS when SMTP_PORT is 587', () => {
    const createTransport = jest
      .spyOn(nodemailer, 'createTransport')
      .mockReturnValue({ sendMail: jest.fn() } as unknown as Transporter);
    const values: Record<string, string> = {
      SMTP_USER: 'mailer@gmail.com',
      SMTP_PASSWORD: 'google-app-password',
      SMTP_PORT: '587',
    };

    new MailService({
      get: jest.fn((key: string) => values[key]),
    } as unknown as ConfigService);

    expect(createTransport).toHaveBeenCalledWith(
      expect.objectContaining({ port: 587, secure: false }),
    );
  });
});
