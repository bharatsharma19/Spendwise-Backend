import twilio from 'twilio';
import { env } from '../config/env.config';
import { AppError, ErrorType, HttpStatusCode } from '../utils/error';

export class TwilioService {
  private static instance: TwilioService;
  private client: twilio.Twilio;
  private otpCache: Map<string, { code: string; expiresAt: number }> = new Map();

  private constructor() {
    if (!env.TWILIO_ACCOUNT_SID || !env.TWILIO_AUTH_TOKEN || !env.TWILIO_PHONE_NUMBER) {
      throw new AppError(
        'Missing required Twilio configuration',
        HttpStatusCode.INTERNAL_SERVER_ERROR,
        ErrorType.DATABASE
      );
    }

    this.client = twilio(env.TWILIO_ACCOUNT_SID, env.TWILIO_AUTH_TOKEN);
  }

  public static getInstance(): TwilioService {
    if (!TwilioService.instance) {
      TwilioService.instance = new TwilioService();
    }
    return TwilioService.instance;
  }

  public async sendOTP(phoneNumber: string): Promise<boolean> {
    try {
      // Generate a 6-digit OTP
      const otp = Math.floor(100000 + Math.random() * 900000).toString();

      // Create message with App Name for clarity
      const message = `Your SpendWise verification code is ${otp}. Valid for 5 minutes.`;

      // Send SMS
      const result = await this.client.messages.create({
        body: message,
        to: phoneNumber,
        from: env.TWILIO_PHONE_NUMBER,
      });

      // Cache the OTP with an expiration
      this.otpCache.set(phoneNumber, {
        code: otp,
        expiresAt: Date.now() + 5 * 60 * 1000, // 5 minutes from now
      });

      return result.status === 'queued' || result.status === 'sent';
    } catch (error: unknown) {
      console.error('Error sending OTP:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to send OTP';
      const errorStatus =
        (error as { status?: number })?.status || HttpStatusCode.INTERNAL_SERVER_ERROR;
      throw new AppError(errorMessage, errorStatus, ErrorType.DATABASE);
    }
  }

  public verifyOTP(phoneNumber: string, code: string): boolean {
    const otpData = this.otpCache.get(phoneNumber);

    // Check if OTP exists and is not expired
    if (!otpData || Date.now() > otpData.expiresAt) {
      return false;
    }

    // Check if codes match
    const isValid = otpData.code === code;

    // Remove OTP after verification attempt
    this.otpCache.delete(phoneNumber);

    return isValid;
  }

  public async sendGroupInviteSMS(
    phoneNumber: string,
    groupName: string,
    inviterName: string,
    inviterPhone: string
  ): Promise<boolean> {
    try {
      const inviterInfo = inviterPhone ? `${inviterName} (${inviterPhone})` : inviterName;
      const message = `Hi! ${inviterInfo} has added you to the group "${groupName}" on SpendWise. Log in to view and settle expenses.`;

      const result = await this.client.messages.create({
        body: message,
        to: phoneNumber,
        from: env.TWILIO_PHONE_NUMBER,
      });

      return result.status === 'queued' || result.status === 'sent';
    } catch (error: unknown) {
      console.error('Error sending group invite SMS:', error);
      // Don't throw - SMS failure shouldn't break the flow
      return false;
    }
  }
}
