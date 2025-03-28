import twilio from 'twilio';
import { env } from '../config/env.config';
import { AppError, HttpStatusCode, ErrorType } from '../utils/error';

export class TwilioService {
  private static instance: TwilioService;
  private client: twilio.Twilio;
  private verifyServiceId: string;

  private constructor() {
    if (
      !env.TWILIO_ACCOUNT_SID ||
      !env.TWILIO_AUTH_TOKEN ||
      !env.TWILIO_VERIFY_SERVICE_ID ||
      !env.TWILIO_PHONE_NUMBER
    ) {
      throw new AppError(
        'Missing required Twilio configuration',
        HttpStatusCode.INTERNAL_SERVER_ERROR,
        ErrorType.DATABASE
      );
    }

    this.client = twilio(env.TWILIO_ACCOUNT_SID, env.TWILIO_AUTH_TOKEN);
    this.verifyServiceId = env.TWILIO_VERIFY_SERVICE_ID;
  }

  public static getInstance(): TwilioService {
    if (!TwilioService.instance) {
      TwilioService.instance = new TwilioService();
    }
    return TwilioService.instance;
  }

  public async sendVerificationCode(phoneNumber: string): Promise<boolean> {
    try {
      const verification = await this.client.verify.v2
        .services(this.verifyServiceId)
        .verifications.create({
          to: phoneNumber,
          channel: 'sms',
        });
      return verification.status === 'pending';
    } catch (error: any) {
      console.error('Error sending verification code:', error);
      throw new AppError(
        error.message || 'Failed to send verification code',
        error.status || HttpStatusCode.INTERNAL_SERVER_ERROR,
        ErrorType.DATABASE
      );
    }
  }

  public async verifyCode(phoneNumber: string, code: string): Promise<boolean> {
    try {
      const verification = await this.client.verify.v2
        .services(this.verifyServiceId)
        .verificationChecks.create({
          to: phoneNumber,
          code,
        });
      return verification.status === 'approved';
    } catch (error: any) {
      console.error('Error verifying code:', error);
      throw new AppError(
        error.message || 'Failed to verify code',
        error.status || HttpStatusCode.INTERNAL_SERVER_ERROR,
        ErrorType.DATABASE
      );
    }
  }

  public async sendSMS(to: string, message: string): Promise<boolean> {
    try {
      const result = await this.client.messages.create({
        body: message,
        to,
        from: env.TWILIO_PHONE_NUMBER,
      });
      return result.status === 'queued';
    } catch (error: any) {
      console.error('Error sending SMS:', error);
      throw new AppError(
        error.message || 'Failed to send SMS',
        error.status || HttpStatusCode.INTERNAL_SERVER_ERROR,
        ErrorType.DATABASE
      );
    }
  }
}
