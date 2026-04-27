import nodemailer from 'nodemailer';
import { config } from './config.js';

export class Mailer {
  private readonly transport = this.createTransport();

  private createTransport() {
    const hasSmtp = config.smtp.host && config.smtp.user && config.smtp.pass;

    if (!hasSmtp) {
      return nodemailer.createTransport({
        streamTransport: true,
        newline: 'unix',
        buffer: true
      });
    }

    return nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.secure,
      auth: {
        user: config.smtp.user,
        pass: config.smtp.pass
      }
    });
  }

  async send(to: string, subject: string, text: string): Promise<void> {
    const info = await this.transport.sendMail({
      from: config.smtp.from,
      to,
      subject,
      text
    });

    console.log(`[Mailer] sent messageId=${info.messageId}`);
  }
}
