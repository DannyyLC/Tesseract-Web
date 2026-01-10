import { Injectable } from '@nestjs/common';
import { MailerService } from '@nestjs-modules/mailer';
import { JwtService } from '@nestjs/jwt';

@Injectable()
export class EmailService {

  constructor(
    private readonly mailerService: MailerService,
    private readonly jwtService: JwtService,
  ) { }

  async sendWelcomeEmail(userEmail: string, name: string) {
    await this.mailerService.sendMail({
      to: userEmail,
      subject: 'Welcome to Our App!',
      html: `<h1>Hello ${name},</h1><p>Welcome to our platform. We are glad to have you!</p>`,
    });
  }

  async sendEmailVerificationEMail(userEmail: string) {
    const token = await this.generateVerificationToken(userEmail);
    const verificationUrl = `${process.env.DOMAIN_BASE_URL}/auth/verify-email?token=${token}`;
    await this.mailerService.sendMail({
      to: userEmail,
      subject: 'Verificacion de Email',
      html: `<h1>Verificación de Email</h1><p>Para verificar tu email, haz clic en el siguiente enlace: <a href="${verificationUrl}">Verificar Email</a></p>`,
    });
  }

  private async generateVerificationToken(payload: string): Promise<string> {
    const token = this.jwtService.sign({
      email: payload,
    }, {
      secret: process.env.JWT_EMAIL_VERIFICATION_SECRET || 'email-verification-secret',
      expiresIn: (process.env.JWT_EMAIL_VERIFICATION_EXPIRES_IN || '30m') as any,
    });
    return token;
  }

  async verifyEmailToken(token: string): Promise<string> {
    const email = this.jwtService.verify(token, {
      secret: process.env.JWT_EMAIL_VERIFICATION_SECRET || 'email-verification-secret',
    });
    return email;
  }
}
