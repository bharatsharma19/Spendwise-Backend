import { supabase } from '../config/supabase';

import {
  ExpenseSplit,
  Group,
  GroupAnalyticsResponse,
  GroupExpense,
  GroupExpenseResponse,
  GroupMember,
  GroupMemberResponse,
  GroupResponse,
  GroupSettlement,
  GroupSettlementResponse,
} from '../models/group.model';
import {
  AppError,
  AuthorizationError,
  ErrorType,
  HttpStatusCode,
  NotFoundError,
} from '../utils/error';
import { logger } from '../utils/logger';
import { BaseService } from './base.service';
import { NotificationService } from './notification.service';

export class GroupService extends BaseService {
  private static instance: GroupService;
  private readonly notificationService: NotificationService;

  private constructor() {
    super('groups');
    this.notificationService = NotificationService.getInstance();
  }

  public static getInstance(): GroupService {
    if (!GroupService.instance) {
      GroupService.instance = new GroupService();
    }
    return GroupService.instance;
  }

  // HELPER: Authorization check
  private async validateMemberAccess(groupId: string, userId: string): Promise<Group> {
    // Check if user is a member using relational table
    const { data: member, error: memberError } = await supabase
      .from('group_members')
      .select('role')
      .eq('group_id', groupId)
      .eq('user_id', userId)
      .single();

    if (memberError || !member) {
      throw new AuthorizationError('You are not a member of this group');
    }

    // Fetch group details
    const { data: group, error: groupError } = await supabase
      .from('groups')
      .select(
        `
        *,
        members:group_members(*),
        expenses:group_expenses(*),
        settlements:group_settlements(*)
      `
      )
      .eq('id', groupId)
      .single();

    if (groupError || !group) {
      throw new NotFoundError('Group not found');
    }

    return group as unknown as Group;
  }

  public async createGroup(
    data: Omit<Group, 'id' | 'created_at' | 'updated_at' | 'members' | 'expenses' | 'settlements'>
  ): Promise<Group> {
    try {
      // Create group
      const { data: group, error: groupError } = await supabase
        .from('groups')
        .insert({
          name: data.name,
          description: data.description,
          created_by: data.created_by,
          currency: data.currency,
          settings: data.settings,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (groupError) throw groupError;

      // Add creator as admin member
      const { data: member, error: memberError } = await supabase
        .from('group_members')
        .insert({
          group_id: group.id,
          user_id: data.created_by,
          role: 'admin',
          joined_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (memberError) throw memberError;

      // Return constructed group object
      return {
        ...group,
        members: [member],
        expenses: [],
        settlements: [],
      } as unknown as Group;
    } catch (error) {
      console.error('Create Group Error:', error);
      throw new AppError(
        'Failed to create group',
        HttpStatusCode.INTERNAL_SERVER_ERROR,
        ErrorType.DATABASE
      );
    }
  }

  public async addGroupMember(
    groupId: string,
    member: Omit<GroupMember, 'id' | 'joined_at'>,
    inviterId: string
  ): Promise<GroupMember> {
    try {
      // Verify inviter is a member of the group
      const { data: inviterMember } = await supabase
        .from('group_members')
        .select('id, role')
        .eq('group_id', groupId)
        .eq('user_id', inviterId)
        .single();

      if (!inviterMember) {
        throw new AuthorizationError('You must be a member of this group to add members');
      }

      // Check if user to add already exists in group
      const { data: existing } = await supabase
        .from('group_members')
        .select('id')
        .eq('group_id', groupId)
        .eq('user_id', member.user_id)
        .single();

      if (existing) {
        throw new AppError(
          'User is already a member of this group',
          HttpStatusCode.CONFLICT,
          ErrorType.CONFLICT
        );
      }

      const { data: newMember, error } = await supabase
        .from('group_members')
        .insert({
          group_id: groupId,
          user_id: member.user_id,
          role: member.role,
          joined_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (error) throw error;

      // Get group and inviter information
      const group = await this.getDocument<Group>(groupId);
      const { data: inviterProfile } = await supabase
        .from('profiles')
        .select('display_name, email, phone_number')
        .eq('id', inviterId)
        .single();

      const inviterName = inviterProfile?.display_name || 'Someone';
      const inviterEmail = inviterProfile?.email || '';
      const inviterPhone = inviterProfile?.phone_number || '';

      // Get member profile for notifications
      const { data: memberProfile } = await supabase
        .from('profiles')
        .select('email, phone_number')
        .eq('id', member.user_id)
        .single();

      // Create in-app notification
      await this.notificationService.createGroupInviteNotification(
        member.user_id,
        groupId,
        group.name,
        inviterId
      );

      // Send notification: Email preferred, fallback to SMS
      // Run in background to avoid blocking response
      (async () => {
        let notificationSent = false;

        // FIX: Do NOT send email to shadow email addresses
        const isShadowEmail =
          memberProfile?.email && memberProfile.email.endsWith('@shadow.spendwise.local');

        // Try email first (if real email exists)
        if (memberProfile?.email && !isShadowEmail) {
          try {
            const { EmailService } = await import('./email.service');
            const emailService = EmailService.getInstance();
            await emailService.sendGroupInviteEmail(
              memberProfile.email,
              group.name,
              inviterName,
              inviterEmail,
              groupId
            );
            notificationSent = true;
            logger.info(
              `Group invite email sent to: ${memberProfile.email} for group "${group.name}"`
            );
          } catch (emailError) {
            logger.error(`Failed to send group invite email to ${memberProfile.email}`, {
              error: emailError,
              groupId,
              groupName: group.name,
            });
          }
        }

        // Try SMS if email not available or failed or is shadow email
        if ((!notificationSent || isShadowEmail) && memberProfile?.phone_number) {
          try {
            const { TwilioService } = await import('./twilio.service');
            const twilioService = TwilioService.getInstance();
            await twilioService.sendGroupInviteSMS(
              memberProfile.phone_number,
              group.name,
              inviterName,
              inviterPhone
            );
            notificationSent = true;
            logger.info(
              `Group invite SMS sent to: ${memberProfile.phone_number} for group "${group.name}"`
            );
          } catch (smsError) {
            logger.error(`Failed to send group invite SMS to ${memberProfile.phone_number}`, {
              error: smsError,
              groupId,
              groupName: group.name,
            });
          }
        }

        if (!notificationSent) {
          logger.warn(`No notification sent (no valid email or phone for user ${member.user_id})`, {
            userId: member.user_id,
            groupId,
          });
        }
      })().catch((err) => logger.error('Background notification error', err));

      // Add bidirectional friendship (if not already friends)
      if (inviterId !== member.user_id) {
        try {
          // Check if friendship already exists
          const { data: existingFriendships } = await supabase
            .from('friends')
            .select('id, user_id, friend_id, status')
            .or(
              `and(user_id.eq.${inviterId},friend_id.eq.${member.user_id}),and(user_id.eq.${member.user_id},friend_id.eq.${inviterId})`
            );

          if (!existingFriendships || existingFriendships.length === 0) {
            await supabase.from('friends').insert({
              user_id: inviterId,
              friend_id: member.user_id,
              status: 'accepted',
              created_at: new Date().toISOString(),
            });
          } else {
            const existing = existingFriendships[0] as { id: string; status: string };
            if (existing.status === 'pending') {
              await supabase
                .from('friends')
                .update({ status: 'accepted', updated_at: new Date().toISOString() })
                .eq('id', existing.id);
            }
          }
        } catch (friendError) {
          console.error('Error adding friendship:', friendError);
        }
      }

      return newMember as unknown as GroupMember;
    } catch (error) {
      console.error('Add Group Member Error:', error);
      if (error instanceof AppError) throw error;
      throw new AppError(
        'Failed to add group member',
        HttpStatusCode.INTERNAL_SERVER_ERROR,
        ErrorType.DATABASE
      );
    }
  }

  public async removeGroupMember(
    groupId: string,
    memberIdToRemove: string,
    requesterId: string
  ): Promise<void> {
    try {
      const group = await this.getDocument<Group>(groupId);
      if (!group) {
        throw new NotFoundError('Group not found');
      }

      const { data: memberToRemove, error: memberError } = await supabase
        .from('group_members')
        .select('id, role')
        .eq('group_id', groupId)
        .eq('user_id', memberIdToRemove)
        .single();

      if (memberError || !memberToRemove) {
        throw new NotFoundError('Member not found in this group');
      }

      const isRequesterAdmin = group.created_by === requesterId;
      const isRequesterRemovingSelf = requesterId === memberIdToRemove;

      if (!isRequesterAdmin && !isRequesterRemovingSelf) {
        throw new AuthorizationError(
          'Only group admin can remove members, or members can leave themselves'
        );
      }

      if (isRequesterRemovingSelf) {
        const analytics = await this.getGroupAnalytics(groupId, memberIdToRemove);
        const balance = analytics.memberBalances[memberIdToRemove] || 0;

        if (Math.abs(balance) > 0.01) {
          throw new AppError(
            `Cannot leave group. You have a non-zero balance of ${balance.toFixed(2)}`,
            HttpStatusCode.CONFLICT,
            ErrorType.CONFLICT
          );
        }
      }

      const { error: deleteError } = await supabase
        .from('group_members')
        .delete()
        .eq('group_id', groupId)
        .eq('user_id', memberIdToRemove);

      if (deleteError) throw deleteError;
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError(
        'Failed to remove group member',
        HttpStatusCode.INTERNAL_SERVER_ERROR,
        ErrorType.DATABASE
      );
    }
  }

  public async addGroupExpense(
    groupId: string,
    data: Omit<GroupExpense, 'id' | 'created_at' | 'updated_at' | 'splits'> & {
      paid_by: string;
      splits?: Array<{ userId: string; amount: number }>;
    }
  ): Promise<GroupExpense> {
    try {
      const group = await this.getDocument<Group>(groupId);

      const { data: members, error: membersError } = await supabase
        .from('group_members')
        .select('*')
        .eq('group_id', groupId);

      if (membersError || !members) throw new Error('Failed to fetch members');

      let splits: ExpenseSplit[];

      if (data.splits && data.splits.length > 0) {
        const memberIds = new Set(members.map((m: { user_id: string }) => m.user_id));
        const invalidUserIds = data.splits.filter((split) => !memberIds.has(split.userId));

        if (invalidUserIds.length > 0) {
          throw new AppError(
            `Invalid user IDs in splits: ${invalidUserIds.map((s) => s.userId).join(', ')}`,
            HttpStatusCode.BAD_REQUEST,
            ErrorType.VALIDATION
          );
        }

        const totalSplitAmount = data.splits.reduce((sum, split) => sum + split.amount, 0);
        if (Math.abs(totalSplitAmount - data.amount) > 0.01) {
          throw new AppError(
            `Split amounts (${totalSplitAmount}) must sum to total amount (${data.amount})`,
            HttpStatusCode.BAD_REQUEST,
            ErrorType.VALIDATION
          );
        }

        splits = data.splits.map((split) => ({
          user_id: split.userId,
          amount: split.amount,
          status: 'pending' as const,
        }));
      } else {
        splits = members.map((member: { user_id: string }) => ({
          user_id: member.user_id,
          amount: data.amount / members.length,
          status: 'pending' as const,
        }));
      }

      const expenseDataWithoutSplits = {
        amount: data.amount,
        currency: data.currency,
        category: data.category,
        description: data.description,
        date: data.date,
        location: data.location,
        tags: data.tags,
        receipt_url: data.receipt_url,
        paid_by: data.paid_by,
      };

      const { data: expense, error } = await supabase
        .from('group_expenses')
        .insert({
          group_id: groupId,
          ...expenseDataWithoutSplits,
          splits,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (error) throw error;

      const notifications = members
        .filter((member: { user_id: string }) => member.user_id !== data.paid_by)
        .map((member: { user_id: string }) =>
          this.notificationService.createExpenseAddedNotification(
            member.user_id,
            groupId,
            group.name,
            expense.id,
            data.amount,
            data.currency
          )
        );
      await Promise.all(notifications);

      return expense as unknown as GroupExpense;
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError(
        'Failed to add group expense',
        HttpStatusCode.INTERNAL_SERVER_ERROR,
        ErrorType.DATABASE
      );
    }
  }

  public async markExpenseAsPaid(
    groupId: string,
    expenseId: string,
    userId: string
  ): Promise<GroupExpense> {
    try {
      const { data: expense, error: fetchError } = await supabase
        .from('group_expenses')
        .select('*')
        .eq('id', expenseId)
        .eq('group_id', groupId)
        .single();

      if (fetchError || !expense) throw new NotFoundError('Expense not found');

      const splits = expense.splits as ExpenseSplit[];
      const splitIndex = splits.findIndex((s) => s.user_id === userId);

      if (splitIndex === -1) {
        throw new AppError(
          'User is not involved in this expense',
          HttpStatusCode.BAD_REQUEST,
          ErrorType.VALIDATION
        );
      }

      if (splits[splitIndex].status === 'paid') {
        return expense as unknown as GroupExpense;
      }

      splits[splitIndex] = {
        ...splits[splitIndex],
        status: 'paid',
        paid_at: new Date().toISOString(),
      };

      const { data: updatedExpense, error: updateError } = await supabase
        .from('group_expenses')
        .update({
          splits,
          updated_at: new Date().toISOString(),
        })
        .eq('id', expenseId)
        .select()
        .single();

      if (updateError) throw updateError;

      return updatedExpense as unknown as GroupExpense;
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError(
        'Failed to mark expense as paid',
        HttpStatusCode.INTERNAL_SERVER_ERROR,
        ErrorType.DATABASE
      );
    }
  }

  public async settleGroup(groupId: string, userId: string): Promise<GroupSettlement[]> {
    await this.validateMemberAccess(groupId, userId);

    const { data, error } = await supabase.rpc('settle_group_expenses', {
      group_id_param: groupId,
    });

    if (error) {
      console.error('Settle Group RPC Error:', error);
      throw new AppError(
        error.message || 'Failed to settle group',
        HttpStatusCode.INTERNAL_SERVER_ERROR,
        ErrorType.DATABASE
      );
    }

    return (data || []) as unknown as GroupSettlement[];
  }

  public async getGroupAnalytics(groupId: string, userId: string): Promise<GroupAnalyticsResponse> {
    await this.validateMemberAccess(groupId, userId);

    try {
      const { data: expenses } = await supabase
        .from('group_expenses')
        .select('*')
        .eq('group_id', groupId);

      const { data: settlements } = await supabase
        .from('group_settlements')
        .select('*')
        .eq('group_id', groupId);

      const safeExpenses = expenses || [];
      const safeSettlements = settlements || [];

      const totalExpenses = safeExpenses.reduce((sum, expense) => sum + expense.amount, 0);
      const totalSettlements = safeSettlements.reduce(
        (sum, settlement) => sum + settlement.amount,
        0
      );

      const memberBalances: Record<string, number> = {};
      safeExpenses.forEach(
        (expense: { paid_by: string; amount: number; splits?: ExpenseSplit[] }) => {
          memberBalances[expense.paid_by] = (memberBalances[expense.paid_by] || 0) + expense.amount;
          const splits = Array.isArray(expense.splits) ? (expense.splits as ExpenseSplit[]) : [];
          splits.forEach((split) => {
            memberBalances[split.user_id] = (memberBalances[split.user_id] || 0) - split.amount;
          });
        }
      );

      const expenseByCategory: Record<string, number> = {};
      safeExpenses.forEach((expense: { category: string; amount: number }) => {
        expenseByCategory[expense.category] =
          (expenseByCategory[expense.category] || 0) + expense.amount;
      });

      return {
        totalExpenses,
        totalSettlements,
        memberBalances,
        expenseByCategory,
      };
    } catch (error) {
      throw new AppError(
        'Failed to get group analytics',
        HttpStatusCode.INTERNAL_SERVER_ERROR,
        ErrorType.DATABASE
      );
    }
  }

  private transformGroupResponse(group: Group): GroupResponse {
    return {
      ...group,
      createdBy: group.created_by,
      code: group.id.slice(0, 6).toUpperCase(),
      status: 'active',
      totalExpenses: group.expenses?.length || 0,
      totalMembers: group.members?.length || 0,
      createdAt: new Date(group.created_at),
      updatedAt: new Date(group.updated_at),
      members: (group.members || []).map((member) => ({
        userId: member.user_id,
        displayName: member.display_name || '',
        email: member.email || '',
        role: member.role,
        joinedAt: new Date(member.joined_at),
      })),
    };
  }

  private transformGroupMemberResponse(member: GroupMember): GroupMemberResponse {
    return {
      id: member.id,
      userId: member.user_id,
      displayName: member.display_name,
      email: member.email,
      role: member.role,
      joinedAt: new Date(member.joined_at),
    };
  }

  private transformGroupExpenseResponse(expense: GroupExpense): GroupExpenseResponse {
    return {
      ...expense,
      paidBy: expense.paid_by,
      receiptUrl: expense.receipt_url,
      splits: expense.splits.map((s) => ({
        userId: s.user_id,
        amount: s.amount,
        status: s.status,
        paidAt: s.paid_at ? new Date(s.paid_at) : undefined,
      })),
      date: new Date(expense.date),
      createdAt: new Date(expense.created_at),
      updatedAt: new Date(expense.updated_at),
    };
  }

  private transformGroupSettlementResponse(settlement: GroupSettlement): GroupSettlementResponse {
    return {
      id: settlement.id,
      from: settlement.from_user,
      to: settlement.to_user,
      amount: settlement.amount,
      status: settlement.status,
      createdAt: new Date(settlement.created_at),
      updatedAt: new Date(settlement.updated_at),
    };
  }

  public async getGroup(groupId: string, userId: string): Promise<GroupResponse> {
    const group = await this.validateMemberAccess(groupId, userId);
    return this.transformGroupResponse(group);
  }

  public async getGroupMember(
    groupId: string,
    memberId: string,
    userId: string
  ): Promise<GroupMemberResponse> {
    await this.validateMemberAccess(groupId, userId);

    const { data: member, error } = await supabase
      .from('group_members')
      .select('*')
      .eq('id', memberId)
      .eq('group_id', groupId)
      .single();

    if (error || !member) {
      throw new NotFoundError('Group member not found');
    }
    return this.transformGroupMemberResponse(member as unknown as GroupMember);
  }

  public async getGroupExpense(
    groupId: string,
    expenseId: string,
    userId: string
  ): Promise<GroupExpenseResponse> {
    await this.validateMemberAccess(groupId, userId);

    const { data: expense, error } = await supabase
      .from('group_expenses')
      .select('*')
      .eq('id', expenseId)
      .eq('group_id', groupId)
      .single();

    if (error || !expense) {
      throw new NotFoundError('Group expense not found');
    }
    return this.transformGroupExpenseResponse(expense as unknown as GroupExpense);
  }

  public async getGroupSettlement(
    groupId: string,
    settlementId: string,
    userId: string
  ): Promise<GroupSettlementResponse> {
    await this.validateMemberAccess(groupId, userId);

    const { data: settlement, error } = await supabase
      .from('group_settlements')
      .select('*')
      .eq('id', settlementId)
      .eq('group_id', groupId)
      .single();

    if (error || !settlement) {
      throw new NotFoundError('Group settlement not found');
    }
    return this.transformGroupSettlementResponse(settlement as unknown as GroupSettlement);
  }
}
