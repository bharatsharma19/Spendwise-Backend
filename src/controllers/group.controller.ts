import { Response, NextFunction } from 'express';
import { GroupService } from '../services/group.service';
import { AppError, ValidationError, HttpStatusCode, ErrorType } from '../utils/error';
import { AuthRequest } from '../middleware/auth';
import { Timestamp } from 'firebase-admin/firestore';
import { groupSchema } from '../validations/group.schema';
import { User } from '../models/user.model';

type AuthenticatedRequest = Omit<AuthRequest, 'user'> & {
  user: Required<Pick<User, 'uid'>> & Omit<User, 'uid'>;
};

export class GroupController {
  private static instance: GroupController;
  private readonly groupService: GroupService;

  private constructor() {
    this.groupService = GroupService.getInstance();
  }

  public static getInstance(): GroupController {
    if (!GroupController.instance) {
      GroupController.instance = new GroupController();
    }
    return GroupController.instance;
  }

  private handleValidationError(error: any): never {
    if (error.details && Array.isArray(error.details) && error.details.length > 0) {
      throw new ValidationError(error.details[0].message, []);
    }
    throw new ValidationError('Validation failed', []);
  }

  private validateUser(req: AuthRequest): asserts req is AuthenticatedRequest {
    if (!req.user?.uid) {
      throw new AppError(
        'User not authenticated',
        HttpStatusCode.UNAUTHORIZED,
        ErrorType.AUTHENTICATION
      );
    }
  }

  public createGroup = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      this.validateUser(req);
      const userId = req.user!.uid;

      const { error, value } = groupSchema.createGroup.validate(req.body);
      if (error) {
        this.handleValidationError(error);
      }

      const groupData = {
        name: value.name,
        description: value.description,
        currency: value.currency,
        createdBy: userId,
        settings: {
          allowMemberInvites: value.settings?.allowMemberInvites ?? true,
          requireApproval: value.settings?.requireApproval ?? false,
          defaultSplitType: value.settings?.defaultSplitType ?? 'equal',
        },
      };

      const group = await this.groupService.createGroup(groupData);
      res.status(201).json({
        status: 'success',
        data: group,
      });
    } catch (error) {
      next(error);
    }
  };

  public addGroupMember = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      this.validateUser(req);
      const userId = req.user!.uid;

      const { groupId } = req.params;
      if (!groupId) {
        this.handleValidationError({ details: [{ message: 'Group ID is required' }] });
      }

      const { error, value } = groupSchema.joinGroup.validate(req.body);
      if (error) {
        this.handleValidationError(error);
      }

      const memberData = {
        userId,
        displayName: value.displayName,
        email: value.email,
        role: 'member' as const,
        joinedAt: Timestamp.now(),
      };

      const member = await this.groupService.addGroupMember(groupId, memberData);
      res.status(201).json({
        status: 'success',
        data: member,
      });
    } catch (error) {
      next(error);
    }
  };

  public addGroupExpense = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      this.validateUser(req);
      const userId = req.user!.uid;

      const { groupId } = req.params;
      if (!groupId) {
        this.handleValidationError({ details: [{ message: 'Group ID is required' }] });
      }

      const { error, value } = groupSchema.addGroupExpense.validate(req.body);
      if (error) {
        this.handleValidationError(error);
      }

      const expenseData = {
        amount: value.amount,
        currency: value.currency,
        category: value.category,
        description: value.description,
        date: Timestamp.fromDate(new Date(value.date)),
        location: value.location,
        tags: value.tags,
        receiptUrl: value.receiptUrl,
        paidBy: userId,
      };

      const expense = await this.groupService.addGroupExpense(groupId, expenseData);
      res.status(201).json({
        status: 'success',
        data: expense,
      });
    } catch (error) {
      next(error);
    }
  };

  public markExpenseAsPaid = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      this.validateUser(req);
      const userId = req.user!.uid;

      const { groupId, expenseId } = req.params;
      if (!groupId || !expenseId) {
        this.handleValidationError({
          details: [{ message: 'Group ID and expense ID are required' }],
        });
      }

      const expense = await this.groupService.markExpenseAsPaid(groupId, expenseId, userId);
      res.json({
        status: 'success',
        data: expense,
      });
    } catch (error) {
      next(error);
    }
  };

  public settleGroup = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      this.validateUser(req);

      const { groupId } = req.params;
      if (!groupId) {
        this.handleValidationError({ details: [{ message: 'Group ID is required' }] });
      }

      const settlement = await this.groupService.settleGroup(groupId);
      res.json({
        status: 'success',
        data: settlement,
      });
    } catch (error) {
      next(error);
    }
  };

  public getGroupAnalytics = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      this.validateUser(req);

      const { groupId } = req.params;
      if (!groupId) {
        this.handleValidationError({ details: [{ message: 'Group ID is required' }] });
      }

      const analytics = await this.groupService.getGroupAnalytics(groupId);
      res.json({
        status: 'success',
        data: analytics,
      });
    } catch (error) {
      next(error);
    }
  };
}
