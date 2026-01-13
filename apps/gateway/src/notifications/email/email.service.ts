import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as nodemailer from 'nodemailer';
import * as handlebars from 'handlebars';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class EmailService {
  private transporter: nodemailer.Transporter;
  private emailVerificationTemplate: handlebars.TemplateDelegate;

  constructor(private readonly jwtService: JwtService) {
    this.transporter = nodemailer.createTransport(
      {
        host: process.env.SMTP_HOST ?? 'smtp-relay.brevo.com',
        port: Number(process.env.SMTP_PORT),
        secure: process.env.MAILER_SECURE === 'true',
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        },
      } as any,
      {
        from: {
          name: 'No-reply',
          address: process.env.SMTP_EMAIL_FROM,
        },
      } as any,
    );

    this.emailVerificationTemplate = this.loadTemplate(
      'email_verification_view.hbs',
    );
  }

  private loadTemplate(templateName: string): handlebars.TemplateDelegate {
    const templatesFolderPath = path.join(__dirname, './html_templates');
    const templatePath = path.join(templatesFolderPath, templateName);

    const templateSource = fs.readFileSync(templatePath, 'utf8');
    return handlebars.compile(templateSource);
  }

  async sendEmailVerificationEMail(userEmail: string) {
    const token = this.generateVerificationToken(userEmail);
    const verificationUrl = `${process.env.DOMAIN_BASE_URL}/auth/verify-email?token=${token}`;
    await this.transporter.sendMail({
      to: userEmail,
      subject: 'Verificacion de Email',
      html: this.emailVerificationTemplate({
        verificationUrl,
        name: userEmail,
      }),
    });
  }

  private generateVerificationToken(payload: string): string {
    return this.jwtService.sign(
      { email: payload },
      {
        secret:
          process.env.JWT_EMAIL_VERIFICATION_SECRET ??
          'email-verification-secret',
        expiresIn: (process.env.JWT_EMAIL_VERIFICATION_EXPIRES_IN ?? '30m') as any,
      },
    );
  }

  verifyEmailToken(token: string): string {
    const email = this.jwtService.verify(token, {
      secret:
        process.env.JWT_EMAIL_VERIFICATION_SECRET ??
        'email-verification-secret',
    });
    return email;
  }
}
