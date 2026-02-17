import { Inject, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as nodemailer from 'nodemailer';
import * as handlebars from 'handlebars';
import * as fs from 'fs';
import * as path from 'path';
import { StartVerificationFlowDto } from '../../auth/dto/start-verification-flow.dto';
import { PrismaService } from '../../database/prisma.service';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Logger } from 'winston';

@Injectable()
export class EmailService {
  private transporter: nodemailer.Transporter;
  private emailVerificationTemplate: handlebars.TemplateDelegate;
  private emailInvitationTemplate: handlebars.TemplateDelegate;
  private emailPasswordResetTemplate: handlebars.TemplateDelegate;
  private emailOrganizationExistsTemplate: handlebars.TemplateDelegate;
  private emailServiceRequestTemplate: handlebars.TemplateDelegate;

  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
    @Inject(WINSTON_MODULE_PROVIDER) private readonly logger: Logger,
  ) {
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

    this.emailVerificationTemplate = this.loadTemplate('email_verification_view.hbs');
    this.emailInvitationTemplate = this.loadTemplate('email_invitation_view.hbs');
    this.emailPasswordResetTemplate = this.loadTemplate('restore_password_es.html');
    this.emailOrganizationExistsTemplate = this.loadTemplate('email_organization_exists.hbs');
    this.emailServiceRequestTemplate = this.loadTemplate('request_services_info.hbs');
  }

  private loadTemplate(templateName: string): handlebars.TemplateDelegate {
    const templatesFolderPath = path.join(__dirname, './html_templates');
    const templatePath = path.join(templatesFolderPath, templateName);

    const templateSource = fs.readFileSync(templatePath, 'utf8');
    return handlebars.compile(templateSource);
  }

  async sendVerificationCodeByEmail(
    payload: StartVerificationFlowDto,
  ): Promise<{ sentMessageInfo: nodemailer.SentMessageInfo | null; verificationCode: string }> {
    const verificationCode = await this.generateVerificationCode();
    let sentMessageInfo: nodemailer.SentMessageInfo = null;
    try {
      sentMessageInfo = await this.transporter.sendMail({
        to: payload.email,
        subject: 'Verificacion de Email',
        html: this.emailVerificationTemplate({
          verificationCode,
          name: payload.userName,
        }),
      });
    } catch (error) {
      this.logger.error(
        `startVerificationEmailFlow >> Error enviando email a ${payload.email}: ${error}`,
      );
      return { sentMessageInfo: null, verificationCode: verificationCode };
    }

    return {
      sentMessageInfo,
      verificationCode,
    };
  }

  async sendOrganizationInvitationToEmail(
    email: string,
    organizationName: string,
  ): Promise<{ sentMessageInfo: nodemailer.SentMessageInfo; verificationCode: string } | null> {
    let sentMessageInfo: nodemailer.SentMessageInfo = null;
    const verificationCode = await this.generateVerificationCode();

    try {
      sentMessageInfo = await this.transporter.sendMail({
        to: email,
        subject: `Invitación para unirte a ${organizationName}`,
        html: this.emailInvitationTemplate({
          inviteUrl: `localhost:3001/accept-invitation?code=${verificationCode}&email=${encodeURIComponent(email)}`,
          organizationName,
        }),
      });
      return { sentMessageInfo, verificationCode };
    } catch (error) {
      this.logger.error(
        `sendOrganizationInvitationToEmail >> Error enviando email a ${email}: ${error}`,
      );
      return null;
    }
  }

  private async generateVerificationCode(): Promise<string> {
    let verificationCode;
    let isVerificationCodeDuplicate;
    do {
      verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
      isVerificationCodeDuplicate = await this.prisma.userVerification.findFirst({
        where: { verificationCode },
      });
    } while (isVerificationCodeDuplicate);
    return verificationCode;
  }

  async sendPasswordResetCodeByEmail(
    email: string
  ): Promise<{ sentMessageInfo: nodemailer.SentMessageInfo | null; verificationCode: string } | null> {
    const verificationCode = await this.generateVerificationCode();
    let sentMessageInfo: nodemailer.SentMessageInfo = null;
    try {
      sentMessageInfo = await this.transporter.sendMail({
        to: email,
        subject: 'Código de restablecimiento de contraseña',
        html: this.emailPasswordResetTemplate({
          verificationCode,
        }),
      });
    } catch (error) {
      this.logger.error(
        `sendPasswordResetCodeByEmail >> Error enviando email a ${email}: ${error}`,
      );
      return null;
    }
    return { sentMessageInfo, verificationCode };
  }

  async sendOrganizationExistsEmail(
    email: string,
    organizationName: string,
  ): Promise<nodemailer.SentMessageInfo | null> {
    try {
      return await this.transporter.sendMail({
        to: email,
        subject: `Invitación para unirte a ${organizationName}`,
        html: this.emailOrganizationExistsTemplate({
          organizationName,
        }),
      });
    } catch (error) {
      this.logger.error(
        `sendOrganizationExistsEmail >> Error enviando email a ${email}: ${error}`,
      );
      return null;
    }
  }

  async sendServiceRequestEmail(
    fromEmail: string,
    targetEmail: string,
    userEmail: string,
    userName: string,
    subject: string,
    userMessage: string,
    organizationName: string,
    date: string,
  ): Promise<nodemailer.SentMessageInfo | null> {
    try {
      return await this.transporter.sendMail({
        from: fromEmail,
        to: targetEmail,
        subject: `Solicitud de Info: ${subject}`,
        html: this.emailServiceRequestTemplate({
          user_email: userEmail,
          user_name: userName,
          subject,
          user_message: userMessage,
          organization_name: organizationName,
          date,
        }),
      });

    } catch (error) {
      this.logger.error(
        `sendServiceRequestEmail >> Error enviando email a ${targetEmail}: ${error}`,
      );
      return null;
    }
  }
}