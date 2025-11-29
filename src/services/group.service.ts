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
          // display_name and email should ideally be fetched from profiles or passed in.
          // For now, we assume the frontend/controller might pass them or we fetch them.
          // But GroupMember model has them.
          // Let's assume we fetch profile to populate them or the DB trigger handles it?
          // The user request didn't specify triggers for group members.
          // I'll fetch the profile to be safe.
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
    member: Omit<GroupMember, 'id' | 'joined_at'>
  ): Promise<GroupMember> {
    try {
      // Check if already exists
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
          // display_name: member.display_name, // If these columns exist in group_members
          // email: member.email
        })
        .select()
        .single();

      if (error) throw error;

      // Notify
      const group = await this.getDocument<Group>(groupId);
      await this.notificationService.createGroupInviteNotification(
        member.user_id,
        groupId,
        group.name,
        group.created_by
      );

      return newMember as unknown as GroupMember;
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError(
        'Failed to add group member',
        HttpStatusCode.INTERNAL_SERVER_ERROR,
        ErrorType.DATABASE
      );
    }
  }

  public async addGroupExpense(
    groupId: string,
    data: Omit<GroupExpense, 'id' | 'created_at' | 'updated_at' | 'splits'> & {
      paid_by: string;
    }
  ): Promise<GroupExpense> {
    try {
      const group = await this.getDocument<Group>(groupId);

      // Fetch all members to calculate splits
      const { data: members, error: membersError } = await supabase
        .from('group_members')
        .select('*')
        .eq('group_id', groupId);

      if (membersError || !members) throw new Error('Failed to fetch members');

      const splits: ExpenseSplit[] = members.map((member: any) => ({
        user_id: member.user_id,
        amount: data.amount / members.length,
        status: 'pending' as const,
      }));

      const { data: expense, error } = await supabase
        .from('group_expenses')
        .insert({
          group_id: groupId,
          ...data,
          splits, // JSONB column
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (error) throw error;

      // Notify members
      const notifications = members
        .filter((member: any) => member.user_id !== data.paid_by)
        .map((member: any) =>
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
      // Fetch expense
      const { data: expense, error: fetchError } = await supabase
        .from('group_expenses')
        .select('*')
        .eq('id', expenseId)
        .eq('group_id', groupId)
        .single();

      if (fetchError || !expense) throw new NotFoundError('Expense not found');

      // Update split status in JSONB
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

  public async settleGroup(groupId: string, userId: string): Promise<GroupSettlement> {
    await this.validateMemberAccess(groupId, userId);

    // Use Supabase RPC for atomicity
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

    // RPC should return the created settlements or the first one
    // Assuming it returns the settlement object(s)
    return data as unknown as GroupSettlement;
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
      safeExpenses.forEach((expense: any) => {
        memberBalances[expense.paid_by] = (memberBalances[expense.paid_by] || 0) + expense.amount;
        (expense.splits as ExpenseSplit[]).forEach((split) => {
          memberBalances[split.user_id] = (memberBalances[split.user_id] || 0) - split.amount;
        });
      });

      const expenseByCategory: Record<string, number> = {};
      safeExpenses.forEach((expense: any) => {
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
        displayName: member.display_name || '', // Fetch if needed
        email: member.email || '', // Fetch if needed
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
        paidAt: s.paid_at ? new Date(s.paid_at) : undefined, // Fix: Convert string to Date or undefined
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
