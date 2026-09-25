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

interface PasswordResetEmailPayload {
  to: string;
  username: string;
  resetLink: string;
  expiresInMinutes: number;
}

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>'"]/g,
    (character) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        "'": '&#39;',
        '"': '&quot;',
      })[character]!,
  );
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
      'noreply@flowfret.app';
    this.isConfigured = apiKey.length > 0;

    if (this.isConfigured) {
      sgMail.setApiKey(apiKey);
    } else {
      this.logger.warn(
        'Email delivery is disabled because SENDGRID_API_KEY is missing.',
      );
    }
  }

  async sendOtpVerificationEmail(payload: OtpEmailPayload): Promise<void> {
    const subject = 'FlowFret — Vérifiez votre compte';
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

    const safeUsername = escapeHtml(payload.username);
    const safeCode = escapeHtml(payload.otpCode);
    const safeLink = escapeHtml(payload.verificationLink);
    const html = `
      <div style="font-family: system-ui, sans-serif; max-width: 480px; margin: 0 auto;">
        <h2 style="color: #111;">FlowFret</h2>
        <p>Bonjour <strong>${safeUsername}</strong>,</p>
        <p>Votre code de vérification à 4 chiffres :</p>
        <p style="font-size: 28px; letter-spacing: 8px; font-weight: 700; color: #111;">
          ${safeCode}
        </p>
        <p>Ce code expire dans <strong>${payload.expiresInMinutes} minutes</strong>.</p>
        <p>
          <a href="${safeLink}"
             style="display:inline-block;padding:12px 20px;background:#e11d48;color:#fff;text-decoration:none;border-radius:8px;">
            Vérifier mon compte
          </a>
        </p>
        <p style="color:#666;font-size:13px;">
          Ou copiez ce lien :<br/>
          <a href="${safeLink}">${safeLink}</a>
        </p>
      </div>
    `;

    if (!this.isConfigured) {
      this.logger.warn('OTP email suppressed because delivery is disabled.');
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

  async sendPasswordResetEmail(
    payload: PasswordResetEmailPayload,
  ): Promise<void> {
    const subject = 'FlowFret — Réinitialisez votre mot de passe';
    const text = [
      `Bonjour ${payload.username},`,
      '',
      'Vous avez demandé la réinitialisation de votre mot de passe.',
      `Ouvrez ce lien dans les ${payload.expiresInMinutes} prochaines minutes :`,
      payload.resetLink,
      '',
      "Si vous n'êtes pas à l'origine de cette demande, ignorez cet e-mail.",
    ].join('\n');
    const safeUsername = escapeHtml(payload.username);
    const safeLink = escapeHtml(payload.resetLink);
    const html = `
      <div style="font-family: system-ui, sans-serif; max-width: 480px; margin: 0 auto;">
        <h2>FlowFret</h2>
        <p>Bonjour <strong>${safeUsername}</strong>,</p>
        <p>Vous avez demandé la réinitialisation de votre mot de passe.</p>
        <p><a href="${safeLink}" style="display:inline-block;padding:12px 20px;background:#e11d48;color:#fff;text-decoration:none;border-radius:8px;">Choisir un nouveau mot de passe</a></p>
        <p>Ce lien expire dans ${payload.expiresInMinutes} minutes.</p>
        <p style="color:#666;font-size:13px;">Si vous n'êtes pas à l'origine de cette demande, ignorez cet e-mail.</p>
      </div>`;

    if (!this.isConfigured) {
      this.logger.warn(
        'Password reset email suppressed because delivery is disabled.',
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
