import nodemailer from 'nodemailer';
import { env } from '../config/env.config';
import { AppError, ErrorType, HttpStatusCode } from '../utils/error';

export class EmailService {
  private static instance: EmailService;
  private transporter: nodemailer.Transporter;

  private constructor() {
    if (!env.EMAIL_USER || !env.EMAIL_APP_PASSWORD) {
      throw new Error('Missing required email environment variables');
    }

    this.transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 465, // SSL
      secure: true,
      auth: {
        user: env.EMAIL_USER,
        pass: env.EMAIL_APP_PASSWORD,
      },
    });
  }

  public static getInstance(): EmailService {
    if (!EmailService.instance) {
      EmailService.instance = new EmailService();
    }
    return EmailService.instance;
  }

  public async sendVerificationEmail(email: string, actionLink: string): Promise<void> {
    try {
      const mailOptions = {
        from: `Spendwise <${env.EMAIL_USER}>`,
        to: email,
        subject: 'You have been invited to Spendwise',
        html: `
          <div style="font-family: sans-serif; padding: 20px; text-align: center;">
            <h2>Welcome to Spendwise!</h2>
            <p>A friend has added you to a group expense. To view details and settle up, please access your account.</p>
            <br />
            <a href="${actionLink}" style="background: #007bff; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; font-weight: bold;">
              Access My Account
            </a>
            <p style="margin-top: 20px; font-size: 12px; color: #666;">This link expires in 24 hours.</p>
          </div>
        `,
      };
      await this.transporter.sendMail(mailOptions);
    } catch (error) {
      console.error('Email send failed:', error);
    }
  }

  public async sendPasswordResetEmail(email: string, resetLink: string): Promise<void> {
    try {
      const mailOptions = {
        from: `Spendwise <${env.EMAIL_USER}>`,
        to: email,
        subject: 'Reset Your Password',
        html: `
          <h1>Password Reset</h1>
          <p>Please click the link below to reset your password:</p>
          <a href="${resetLink}">${resetLink}</a>
          <p>This link will expire in 1 hour.</p>
          <p>If you didn't request this password reset, please ignore this email.</p>
        `,
      };

      await this.transporter.sendMail(mailOptions);
    } catch (error: unknown) {
      console.error('Error sending password reset email:', error);
      const errorMessage =
        error instanceof Error ? error.message : 'Failed to send password reset email';
      const errorStatus =
        (error as { status?: number })?.status || HttpStatusCode.INTERNAL_SERVER_ERROR;
      throw new AppError(errorMessage, errorStatus, ErrorType.DATABASE);
    }
  }

  public async sendGroupInviteEmail(
    email: string,
    groupName: string,
    inviterName: string,
    inviterEmail: string,
    groupId: string
  ): Promise<void> {
    try {
      const appUrl = env.FRONTEND_URL || 'http://localhost:3000';
      const groupLink = `${appUrl}/groups/${groupId}`;
      const inviterInfo = inviterEmail ? `${inviterName} (${inviterEmail})` : inviterName;

      const mailOptions = {
        from: `Spendwise <${env.EMAIL_USER}>`,
        to: email,
        subject: `You've been added to "${groupName}"`,
        html: `
          <h1>Group Invitation</h1>
          <p>Hello!</p>
          <p><strong>${inviterInfo}</strong> has added you to the group "<strong>${groupName}</strong>".</p>
          <p>You can now view and manage expenses in this group.</p>
          <p><a href="${groupLink}">View Group</a></p>
          <p>If you didn't expect this invitation, you can ignore this email.</p>
          <p>Best regards,<br>Smart Expense Tracker Team</p>
        `,
      };

      await this.transporter.sendMail(mailOptions);
    } catch (error: unknown) {
      console.error('Error sending group invite email:', error);
      // Don't throw - email failure shouldn't break the flow
    }
  }

  public async sendEmail(to: string, subject: string, html: string): Promise<void> {
    try {
      const mailOptions = {
        from: `Spendwise <${env.EMAIL_USER}>`,
        to,
        subject,
        html,
      };
      await this.transporter.sendMail(mailOptions);
    } catch (error) {
      console.error('Email send failed:', error);
      // We don't throw here to avoid failing the main request if email fails
    }
  }
}
