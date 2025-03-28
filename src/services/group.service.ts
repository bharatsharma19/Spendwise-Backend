import { db } from '../config/firebase';
import {
  Group,
  GroupResponse,
  GroupExpense,
  GroupMember,
  GroupSettlement,
  ExpenseSplit,
} from '../models/group.model';
import { AppError, HttpStatusCode, ErrorType } from '../utils/error';
import { Timestamp } from 'firebase-admin/firestore';
import { UserService } from './user.service';
import { ExpenseService } from './expense.service';
import { NotificationService } from './notification.service';
import { BaseService } from './base.service';
import {
  GroupMemberResponse,
  GroupExpenseResponse,
  GroupSettlementResponse,
} from '../models/response.model';

export class GroupService extends BaseService {
  private static instance: GroupService;
  private readonly notificationService: NotificationService;

  private constructor() {
    super('groups');
    this.userService = UserService.getInstance();
    this.expenseService = ExpenseService.getInstance();
    this.notificationService = NotificationService.getInstance();
  }

  public static getInstance(): GroupService {
    if (!GroupService.instance) {
      GroupService.instance = new GroupService();
    }
    return GroupService.instance;
  }

  private generateGroupCode(): string {
    return Math.random().toString(36).substring(2, 10).toUpperCase();
  }

  public async createGroup(
    data: Omit<Group, 'id' | 'createdAt' | 'updatedAt' | 'members' | 'expenses' | 'settlements'>
  ): Promise<Group> {
    try {
      const group = await this.createDocument<Group>({
        ...data,
        members: [],
        expenses: [],
        settlements: [],
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      });

      // Add creator as first member with admin role
      await this.addGroupMember(group.id, {
        userId: data.createdBy,
        displayName: '', // Will be updated by user service
        email: '', // Will be updated by user service
        role: 'admin',
        joinedAt: Timestamp.now(),
      });

      return group;
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError(
        'Failed to create group',
        HttpStatusCode.INTERNAL_SERVER_ERROR,
        ErrorType.DATABASE
      );
    }
  }

  public async addGroupMember(
    groupId: string,
    member: Omit<GroupMember, 'id'>
  ): Promise<GroupMember> {
    try {
      const group = await this.getDocument<Group>(groupId);
      if (group.members.some((m) => m.userId === member.userId)) {
        throw new AppError(
          'User is already a member of this group',
          HttpStatusCode.CONFLICT,
          ErrorType.CONFLICT
        );
      }

      const newMember = await this.addToSubCollection<GroupMember>(groupId, 'members', member);

      // Notify the new member
      await this.notificationService.createGroupInviteNotification(
        member.userId,
        groupId,
        group.name,
        group.createdBy
      );

      return newMember;
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
    data: Omit<GroupExpense, 'id' | 'createdAt' | 'updatedAt' | 'splits'> & {
      paidBy: string;
    }
  ): Promise<GroupExpense> {
    try {
      const group = await this.getDocument<Group>(groupId);
      const splits: ExpenseSplit[] = group.members.map((member) => ({
        userId: member.userId,
        amount: data.amount / group.members.length,
        status: 'pending' as const,
      }));

      const expense = await this.addToSubCollection<GroupExpense>(groupId, 'expenses', {
        ...data,
        splits,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      });

      // Notify all members about the new expense
      const notifications = group.members
        .filter((member) => member.userId !== data.paidBy)
        .map((member) =>
          this.notificationService.createExpenseAddedNotification(
            member.userId,
            groupId,
            group.name,
            expense.id,
            data.amount,
            data.currency
          )
        );
      await Promise.all(notifications);

      return expense;
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
      const expense = await this.getSubCollection<GroupExpense>(groupId, 'expenses', [
        { field: 'id', operator: '==', value: expenseId },
      ]).then((expenses) => expenses[0]);

      if (!expense) {
        throw new AppError('Expense not found', HttpStatusCode.NOT_FOUND, ErrorType.NOT_FOUND);
      }

      const updatedSplits = expense.splits.map((split) =>
        split.userId === userId
          ? { ...split, status: 'paid' as const, paidAt: Timestamp.now() }
          : split
      );

      const updatedExpense = await this.updateSubCollectionDocument<GroupExpense>(
        groupId,
        'expenses',
        expenseId,
        { splits: updatedSplits }
      );

      // Check if all splits are paid
      if (updatedExpense.splits.every((split) => split.status === 'paid')) {
        const group = await this.getDocument<Group>(groupId);
        await this.notificationService.createExpensePaidNotification(
          expense.paidBy,
          groupId,
          group.name,
          expenseId,
          expense.amount,
          expense.currency
        );
      }

      return updatedExpense;
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError(
        'Failed to mark expense as paid',
        HttpStatusCode.INTERNAL_SERVER_ERROR,
        ErrorType.DATABASE
      );
    }
  }

  public async settleGroup(groupId: string): Promise<GroupSettlement> {
    try {
      const group = await this.getDocument<Group>(groupId);
      const expenses = await this.getSubCollection<GroupExpense>(groupId, 'expenses');

      // Calculate total balances for each member
      const balances = new Map<string, number>();
      expenses.forEach((expense) => {
        // Add expense amount to payer's balance
        balances.set(expense.paidBy, (balances.get(expense.paidBy) || 0) + expense.amount);

        // Subtract split amount from each member's balance
        expense.splits.forEach((split) => {
          balances.set(split.userId, (balances.get(split.userId) || 0) - split.amount);
        });
      });

      // Create settlement records
      const settlements: Omit<GroupSettlement, 'id'>[] = [];
      const members = Array.from(balances.entries());

      for (let i = 0; i < members.length; i++) {
        for (let j = i + 1; j < members.length; j++) {
          const member1Entry = members[i];
          const member2Entry = members[j];
          if (!member1Entry || !member2Entry) continue;

          const [member1, balance1] = member1Entry;
          const [member2, balance2] = member2Entry;

          if (balance1 > balance2) {
            settlements.push({
              from: member2,
              to: member1,
              amount: balance1 - balance2,
              status: 'pending' as const,
              createdAt: Timestamp.now(),
              updatedAt: Timestamp.now(),
            });
          } else if (balance2 > balance1) {
            settlements.push({
              from: member1,
              to: member2,
              amount: balance2 - balance1,
              status: 'pending' as const,
              createdAt: Timestamp.now(),
              updatedAt: Timestamp.now(),
            });
          }
        }
      }

      // Add settlements to group
      const batch = db.batch();
      const addedSettlements: GroupSettlement[] = [];

      for (const settlement of settlements) {
        const docRef = db.collection(this.collection).doc(groupId).collection('settlements').doc();
        batch.set(docRef, settlement);
        addedSettlements.push({ ...settlement, id: docRef.id });
      }
      await batch.commit();

      // Notify all members about the settlement
      const notifications = group.members.map((member) =>
        this.notificationService.createGroupSettledNotification(member.userId, groupId, group.name)
      );
      await Promise.all(notifications);

      if (addedSettlements.length === 0) {
        throw new AppError(
          'No settlements needed',
          HttpStatusCode.BAD_REQUEST,
          ErrorType.VALIDATION
        );
      }

      const firstSettlement = addedSettlements[0];
      if (!firstSettlement) {
        throw new AppError(
          'Failed to create settlement',
          HttpStatusCode.INTERNAL_SERVER_ERROR,
          ErrorType.DATABASE
        );
      }
      return firstSettlement;
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError(
        'Failed to settle group',
        HttpStatusCode.INTERNAL_SERVER_ERROR,
        ErrorType.DATABASE
      );
    }
  }

  public async getGroupAnalytics(groupId: string): Promise<{
    totalExpenses: number;
    totalSettlements: number;
    memberBalances: Record<string, number>;
    expenseByCategory: Record<string, number>;
  }> {
    try {
      const group = await this.getDocument<Group>(groupId);
      const expenses = await this.getSubCollection<GroupExpense>(groupId, 'expenses');
      const settlements = await this.getSubCollection<GroupSettlement>(groupId, 'settlements');

      // Calculate total expenses and settlements
      const totalExpenses = expenses.reduce((sum, expense) => sum + expense.amount, 0);
      const totalSettlements = settlements.reduce((sum, settlement) => sum + settlement.amount, 0);

      // Calculate member balances
      const memberBalances: Record<string, number> = {};
      expenses.forEach((expense) => {
        memberBalances[expense.paidBy] = (memberBalances[expense.paidBy] || 0) + expense.amount;
        expense.splits.forEach((split) => {
          memberBalances[split.userId] = (memberBalances[split.userId] || 0) - split.amount;
        });
      });

      // Calculate expenses by category
      const expenseByCategory: Record<string, number> = {};
      expenses.forEach((expense) => {
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
      if (error instanceof AppError) throw error;
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
      code: group.id.slice(0, 6).toUpperCase(),
      status: 'active',
      totalExpenses: group.expenses.length,
      totalMembers: group.members.length,
      createdAt: group.createdAt.toDate(),
      updatedAt: group.updatedAt.toDate(),
      members: group.members.map((member) => ({
        ...member,
        joinedAt: member.joinedAt.toDate(),
      })),
    };
  }

  private transformGroupMemberResponse(member: GroupMember): GroupMemberResponse {
    return {
      ...member,
      joinedAt: member.joinedAt.toDate(),
    };
  }

  private transformGroupExpenseResponse(expense: GroupExpense): GroupExpenseResponse {
    return {
      ...expense,
      date: expense.date.toDate(),
      createdAt: expense.createdAt.toDate(),
      updatedAt: expense.updatedAt.toDate(),
    };
  }

  private transformGroupSettlementResponse(settlement: GroupSettlement): GroupSettlementResponse {
    return {
      ...settlement,
      createdAt: settlement.createdAt.toDate(),
      updatedAt: settlement.updatedAt.toDate(),
    };
  }
}
