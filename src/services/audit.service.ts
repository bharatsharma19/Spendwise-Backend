import { supabase } from '../config/supabase';
import { logger } from '../utils/logger';

export type AuditAction = 'CREATE' | 'UPDATE' | 'DELETE';
export type AuditEntityType = 'expense' | 'group' | 'profile' | 'member';

export class AuditService {
  private static instance: AuditService;

  private constructor() {}

  public static getInstance(): AuditService {
    if (!AuditService.instance) {
      AuditService.instance = new AuditService();
    }
    return AuditService.instance;
  }

  /**
   * Log an action to the audit_logs table.
   * This is "fire and forget" - we don't want audit logging to block the main operation
   * or cause it to fail if the audit log insertion fails.
   */
  async logAction(
    userId: string,
    action: AuditAction,
    entityType: AuditEntityType,
    entityId: string,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    try {
      // Use admin client (supabase) or user client?
      // Since end users might not have permission to INSERT audit_logs depending on RLS,
      // safer to use the admin client (supabase) for reliable logging.
      // However, my SQL RLS said "Users can insert their own".
      // Let's use the admin client to ensure it always works regardless of user context quirks,
      // and it's a backend-system level log.

      const { error } = await supabase.from('audit_logs').insert({
        user_id: userId,
        action,
        entity_type: entityType,
        entity_id: entityId,
        metadata,
      });

      if (error) {
        logger.warn('Failed to insert audit log', error);
      }
    } catch (err) {
      logger.error('Error logging audit action', err);
    }
  }
}
