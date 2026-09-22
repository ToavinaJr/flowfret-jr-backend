import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MailService } from './mail.service';

describe('MailService', () => {
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
});
