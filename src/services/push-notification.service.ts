import { Expo, ExpoPushMessage } from 'expo-server-sdk';
import { supabase } from '../config/supabase';
import { logger } from '../utils/logger';

export class PushNotificationService {
  private static instance: PushNotificationService;
  private expo: Expo;

  private constructor() {
    this.expo = new Expo();
  }

  public static getInstance(): PushNotificationService {
    if (!PushNotificationService.instance) {
      PushNotificationService.instance = new PushNotificationService();
    }
    return PushNotificationService.instance;
  }

  /**
   * Register a user's push token
   */
  public async registerToken(userId: string, token: string, deviceType?: string): Promise<void> {
    if (!Expo.isExpoPushToken(token)) {
      logger.error(`Invalid Expo push token for user ${userId}: ${token}`);
      return;
    }

    try {
      const { error } = await supabase.from('user_push_tokens').upsert(
        {
          user_id: userId,
          token: token,
          device_type: deviceType || 'unknown',
          last_used_at: new Date().toISOString(),
        },
        { onConflict: 'user_id, token' }
      );

      if (error) {
        logger.error(`Failed to register push token for user ${userId}`, error);
      } else {
        logger.info(`Push token registered for user ${userId}`);
      }
    } catch (err) {
      logger.error('Error registering push token', err);
    }
  }

  /**
   * Send push notifications to specific users
   */
  public async sendPushNotifications(
    userIds: string[],
    title: string,
    body: string,
    data?: Record<string, unknown>
  ): Promise<void> {
    // Fetch tokens for users
    const { data: tokensData, error } = await supabase
      .from('user_push_tokens')
      .select('token')
      .in('user_id', userIds);

    if (error || !tokensData || tokensData.length === 0) {
      if (error) logger.error('Failed to fetch push tokens', error);
      return;
    }

    const tokens = tokensData.map((t) => t.token);
    const messages: ExpoPushMessage[] = [];

    for (const token of tokens) {
      if (!Expo.isExpoPushToken(token)) continue;

      messages.push({
        to: token,
        sound: 'default',
        title,
        body,
        data: data || {},
      });
    }

    // Chunk messages (Expo recommends batching)
    const chunks = this.expo.chunkPushNotifications(messages);

    for (const chunk of chunks) {
      try {
        await this.expo.sendPushNotificationsAsync(chunk);
        // Process tickets if needed (to handle errors immediately)
        // For simplicity, we just log success/fail here
        logger.info(`Sent ${chunk.length} push notifications`);
      } catch (error) {
        logger.error('Error sending push notification chunk', error);
      }
    }
  }

  /**
   * Send a broadcast notification to all users with tokens
   */
  public async sendBroadcast(
    title: string,
    body: string,
    data?: Record<string, unknown>
  ): Promise<void> {
    // Warning: Fetching all tokens might be heavy for large user bases.
    // Consider pagination or specialized broadcast logic for production at scale.

    // For now, fetch in batches
    // TODO: Implement batched fetching if user count grows significantly

    const { data: tokensData, error } = await supabase.from('user_push_tokens').select('token');

    if (error || !tokensData) {
      logger.error('Failed to fetch tokens for broadcast', error);
      return;
    }

    const tokens = tokensData.map((t) => t.token);
    const messages: ExpoPushMessage[] = [];

    for (const token of tokens) {
      if (!Expo.isExpoPushToken(token)) continue;
      messages.push({ to: token, sound: 'default', title, body, data: data || {} });
    }

    const chunks = this.expo.chunkPushNotifications(messages);
    for (const chunk of chunks) {
      try {
        await this.expo.sendPushNotificationsAsync(chunk);
        logger.info(`Sent broadcast chunk of ${chunk.length}`);
      } catch (error) {
        logger.error('Error sending broadcast chunk', error);
      }
    }
  }
}
