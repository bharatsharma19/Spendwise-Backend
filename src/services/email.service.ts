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

  public async sendVerificationEmail(email: string, verificationLink: string): Promise<void> {
    try {
      const mailOptions = {
        from: env.EMAIL_USER,
        to: email,
        subject: 'Verify Your Email',
        html: `
          <h1>Email Verification</h1>
          <p>Please click the link below to verify your email address:</p>
          <a href="${verificationLink}">${verificationLink}</a>
          <p>This link will expire in 1 hour.</p>
          <p>If you didn't request this verification, please ignore this email.</p>
        `,
      };

      await this.transporter.sendMail(mailOptions);
    } catch (error: unknown) {
      console.error('Error sending verification email:', error);
      const errorMessage =
        error instanceof Error ? error.message : 'Failed to send verification email';
      const errorStatus =
        (error as { status?: number })?.status || HttpStatusCode.INTERNAL_SERVER_ERROR;
      throw new AppError(errorMessage, errorStatus, ErrorType.DATABASE);
    }
  }

  public async sendPasswordResetEmail(email: string, resetLink: string): Promise<void> {
    try {
      const mailOptions = {
        from: env.EMAIL_USER,
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
}
