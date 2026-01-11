import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { EmailService } from './email/email.service';

@Module({
  imports: [
    // MailerModule.forRoot({
    //   transport: {
    //     host: 'smtp-relay.brevo.com', // e.g., smtp.gmail.com
    //     port: 587,
    //     secure: false, // true for 465, false for other ports
    //     auth: {
    //       user: '9f9a25001@smtp-brevo.com',
    //       pass: '1ESkhzqxm2nYZgVt',
    //     },
    //   },
    //   defaults: {
    //     from: '"No Reply" <fractaliaindustries@gmail.com>',
    //   },
    //   template: {
    //     dir: join(__dirname, '/notifications/email/templates'),
    //     adapter: new HandlebarsAdapter(),
    //     options: {
    //       strict: true,
    //     },
    //   },
    // }),
    // Add JwtModule for JWT functionality
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'defaultSecret',
      signOptions: { expiresIn: '1h' },
    }),
  ],
  providers: [EmailService],
  exports: [EmailService],
})
export class NotificationsModule {}
