import twilio from 'twilio';
import { env } from '../config/env.config';
import { AppError, HttpStatusCode, ErrorType } from '../utils/error';

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

      // Create message
      const message = `Your verification code is ${otp}. This code will expire in 5 minutes.`;

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
    } catch (error: any) {
      console.error('Error sending OTP:', error);
      throw new AppError(
        error.message || 'Failed to send OTP',
        error.status || HttpStatusCode.INTERNAL_SERVER_ERROR,
        ErrorType.DATABASE
      );
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
}
