import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import sgMail from '@sendgrid/mail';

interface OtpEmailPayload {
  to: string;
  username: string;
  otpCode: string;
  verificationLink: string;
  expiresInMinutes: number;
}

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly fromEmail: string;
  private readonly isConfigured: boolean;

  constructor(private readonly configService: ConfigService) {
    const apiKey = this.configService.get<string>('SENDGRID_API_KEY') ?? '';
    this.fromEmail =
      this.configService.get<string>('SENDGRID_FROM_EMAIL') ??
      'noreply@fretflow.app';
    this.isConfigured = apiKey.length > 0;

    if (this.isConfigured) {
      sgMail.setApiKey(apiKey);
    } else {
      this.logger.warn(
        'SENDGRID_API_KEY is missing — OTP emails will be logged only.',
      );
    }
  }

  async sendOtpVerificationEmail(payload: OtpEmailPayload): Promise<void> {
    const subject = 'FretFlow — Vérifiez votre compte';
    const text = [
      `Bonjour ${payload.username},`,
      '',
      `Votre code de vérification est : ${payload.otpCode}`,
      `Ce code expire dans ${payload.expiresInMinutes} minutes.`,
      '',
      `Ou ouvrez ce lien pour saisir le code :`,
      payload.verificationLink,
      '',
      'Si vous n’avez pas créé de compte, ignorez cet e-mail.',
    ].join('\n');

    const html = `
      <div style="font-family: system-ui, sans-serif; max-width: 480px; margin: 0 auto;">
        <h2 style="color: #111;">FretFlow</h2>
        <p>Bonjour <strong>${payload.username}</strong>,</p>
        <p>Votre code de vérification à 4 chiffres :</p>
        <p style="font-size: 28px; letter-spacing: 8px; font-weight: 700; color: #111;">
          ${payload.otpCode}
        </p>
        <p>Ce code expire dans <strong>${payload.expiresInMinutes} minutes</strong>.</p>
        <p>
          <a href="${payload.verificationLink}"
             style="display:inline-block;padding:12px 20px;background:#e11d48;color:#fff;text-decoration:none;border-radius:8px;">
            Vérifier mon compte
          </a>
        </p>
        <p style="color:#666;font-size:13px;">
          Ou copiez ce lien :<br/>
          <a href="${payload.verificationLink}">${payload.verificationLink}</a>
        </p>
      </div>
    `;

    if (!this.isConfigured) {
      this.logger.log(
        `[DEV OTP] to=${payload.to} code=${payload.otpCode} link=${payload.verificationLink}`,
      );
      return;
    }

    await sgMail.send({
      to: payload.to,
      from: this.fromEmail,
      subject,
      text,
      html,
    });
  }
}
