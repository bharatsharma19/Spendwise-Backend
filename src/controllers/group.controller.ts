import { NextFunction, Response } from 'express';
import Joi from 'joi';
import { AuthRequest } from '../middleware/auth';
import { User } from '../models/user.model';
import { GroupService } from '../services/group.service';
import { UserService } from '../services/user.service';
import { AppError, ErrorType, HttpStatusCode, ValidationError } from '../utils/error';
import { groupSchema } from '../validations/group.schema';

type AuthenticatedRequest = Omit<AuthRequest, 'user'> & {
  user: Required<Pick<User, 'uid'>> & Omit<User, 'uid'>;
};

export class GroupController {
  private static instance: GroupController;
  private readonly groupService: GroupService;
  private readonly userService: UserService;

  private constructor() {
    this.groupService = GroupService.getInstance();
    this.userService = UserService.getInstance();
  }

  public static getInstance(): GroupController {
    if (!GroupController.instance) {
      GroupController.instance = new GroupController();
    }
    return GroupController.instance;
  }

  private handleValidationError(
    error: Joi.ValidationError | { details?: Array<{ message: string }> }
  ): never {
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

  public createGroup = async (
    req: AuthRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
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
        created_by: userId,
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

  public updateGroup = async (
    req: AuthRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      this.validateUser(req);
      const userId = req.user!.uid;
      const { groupId } = req.params;

      if (!groupId) {
        this.handleValidationError({ details: [{ message: 'Group ID is required' }] });
      }

      const { error, value } = groupSchema.updateGroup.validate(req.body); // Assuming updateGroup validation schema exists or reuse create with optional
      // Using generic object validation for now if schema not ready, or partial createGroup schema
      // Let's assume passed body is valid partial
      if (error) {
        this.handleValidationError(error);
      }

      const updatedGroup = await this.groupService.updateGroup(groupId, value, userId);
      res.json({
        status: 'success',
        data: updatedGroup,
      });
    } catch (error) {
      next(error);
    }
  };

  public deleteGroup = async (
    req: AuthRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      this.validateUser(req);
      const userId = req.user!.uid;
      const { groupId } = req.params;

      if (!groupId) {
        this.handleValidationError({ details: [{ message: 'Group ID is required' }] });
      }

      await this.groupService.deleteGroup(groupId, userId);
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  };

  public addGroupMember = async (
    req: AuthRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      this.validateUser(req);

      const { groupId } = req.params;
      if (!groupId) {
        this.handleValidationError({ details: [{ message: 'Group ID is required' }] });
      }

      // Validate request body - should have email or phoneNumber
      const { error, value } = groupSchema.addMember.validate(req.body);
      if (error) this.handleValidationError(error);

      // Find or create user by email or phone
      const { user: userToAdd, isNewUser } = await this.userService.findOrCreateUser(
        value.email,
        value.phoneNumber,
        value.displayName
      );

      const memberData = {
        user_id: userToAdd.uid,
        display_name: value.displayName || userToAdd.displayName || 'Member',
        email: userToAdd.email,
        role: 'member' as const,
      };

      // Pass inviter ID (current user) to the service
      const inviterId = req.user!.uid;
      const member = await this.groupService.addGroupMember(groupId, memberData, inviterId);

      res.status(201).json({
        status: 'success',
        data: {
          ...member,
          isNewUser, // Indicate if user was just created
        },
      });
    } catch (error) {
      next(error);
    }
  };

  public leaveGroup = async (
    req: AuthRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      this.validateUser(req);
      const userId = req.user!.uid;
      const { groupId } = req.params;

      if (!groupId) {
        this.handleValidationError({ details: [{ message: 'Group ID is required' }] });
      }

      // User is leaving themselves
      await this.groupService.removeGroupMember(groupId, userId, userId);

      res.status(200).json({
        status: 'success',
        message: 'Successfully left the group',
      });
    } catch (error) {
      next(error);
    }
  };

  public removeGroupMember = async (
    req: AuthRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      this.validateUser(req);
      const requesterId = req.user!.uid;
      const { groupId, memberId } = req.params;

      if (!groupId || !memberId) {
        this.handleValidationError({
          details: [{ message: 'Group ID and Member ID are required' }],
        });
      }

      // Admin removing a member
      await this.groupService.removeGroupMember(groupId, memberId, requesterId);

      res.status(200).json({
        status: 'success',
        message: 'Member removed successfully',
      });
    } catch (error) {
      next(error);
    }
  };

  public addGroupExpense = async (
    req: AuthRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
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
        date: new Date(value.date).toISOString(),
        location: value.location,
        tags: value.tags,
        receipt_url: value.receiptUrl,
        paid_by: userId,
        splits: value.splits, // Pass splits from request
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

  public markExpenseAsPaid = async (
    req: AuthRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
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

  public settleGroup = async (
    req: AuthRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      this.validateUser(req);

      const { groupId } = req.params;
      if (!groupId) {
        this.handleValidationError({ details: [{ message: 'Group ID is required' }] });
      }

      const settlement = await this.groupService.settleGroup(groupId, req.user!.uid);
      res.json({
        status: 'success',
        data: settlement,
      });
    } catch (error) {
      next(error);
    }
  };

  public getGroup = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      this.validateUser(req);

      const { groupId } = req.params;
      if (!groupId) {
        this.handleValidationError({ details: [{ message: 'Group ID is required' }] });
      }

      const group = await this.groupService.getGroup(groupId, req.user!.uid);
      res.json({
        status: 'success',
        data: group,
      });
    } catch (error) {
      next(error);
    }
  };

  public getGroupAnalytics = async (
    req: AuthRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      this.validateUser(req);

      const { groupId } = req.params;
      if (!groupId) {
        this.handleValidationError({ details: [{ message: 'Group ID is required' }] });
      }

      const analytics = await this.groupService.getGroupAnalytics(groupId, req.user!.uid);
      res.json({
        status: 'success',
        data: analytics,
      });
    } catch (error) {
      next(error);
    }
  };

  public getGroupExpenses = async (
    req: AuthRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      this.validateUser(req);
      const userId = req.user!.uid;
      const { groupId } = req.params;
      const { limit, offset } = req.query;

      if (!groupId) {
        this.handleValidationError({ details: [{ message: 'Group ID is required' }] });
      }

      const expenses = await this.groupService.getGroupExpenses(groupId, userId, {
        limit: limit ? parseInt(limit as string, 10) : undefined,
        offset: offset ? parseInt(offset as string, 10) : undefined,
      });

      res.status(200).json({
        status: 'success',
        data: expenses,
      });
    } catch (error) {
      next(error);
    }
  };

  public listGroups = async (
    req: AuthRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      this.validateUser(req);
      const groups = await this.groupService.getUserGroups(req.user!.uid);
      res.json({
        status: 'success',
        data: groups,
      });
    } catch (error) {
      next(error);
    }
  };
}
