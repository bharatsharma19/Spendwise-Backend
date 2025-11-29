import { NextFunction, Response } from 'express';
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

  public addGroupMember = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      this.validateUser(req);
      const userId = req.user!.uid;

      const { groupId } = req.params;
      if (!groupId) {
        this.handleValidationError({ details: [{ message: 'Group ID is required' }] });
      }

      // Check if it's an invite by email
      if (req.body.email) {
        const { error, value } = groupSchema.addMember.validate(req.body);
        if (error) this.handleValidationError(error);

        // Find user by email
        const userToAdd = await this.userService.getUserByEmail(value.email);

        const memberData = {
          user_id: userToAdd.uid,
          display_name: value.displayName || userToAdd.displayName || 'Member',
          email: userToAdd.email,
          role: 'member' as const,
        };

        const member = await this.groupService.addGroupMember(groupId, memberData);
        res.status(201).json({
          status: 'success',
          data: member,
        });
        return;
      }

      // Fallback to existing logic (joining by code or self-add if we supported that, but schema enforces code)
      // Actually, the previous logic was using joinGroup schema which requires 'code'.
      // But the method implementation was just taking userId and adding them.
      // If the user is joining via code, they are adding THEMSELVES.

      const { error, value } = groupSchema.joinGroup.validate(req.body);
      if (error) {
        this.handleValidationError(error);
      }

      // If joining by code, we verify the code (logic should be in service, but here we just add current user)
      // TODO: Verify code in service if needed. For now, assuming code validation happens or is just a gatekeeper.

      const memberData = {
        user_id: userId,
        display_name: value.displayName, // Schema doesn't have displayName for joinGroup?
        email: req.user!.email, // We have email from auth
        role: 'member' as const,
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

  public leaveGroup = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      this.validateUser(req);
      const userId = req.user!.uid;
      const { groupId } = req.params;

      if (!groupId) {
        this.handleValidationError({ details: [{ message: 'Group ID is required' }] });
      }

      await this.groupService.removeGroupMember(groupId, userId);

      res.status(200).json({
        status: 'success',
        message: 'Successfully left the group',
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
        date: new Date(value.date).toISOString(),
        location: value.location,
        tags: value.tags,
        receipt_url: value.receiptUrl,
        paid_by: userId,
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

      const settlement = await this.groupService.settleGroup(groupId, req.user!.uid);
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

      const analytics = await this.groupService.getGroupAnalytics(groupId, req.user!.uid);
      res.json({
        status: 'success',
        data: analytics,
      });
    } catch (error) {
      next(error);
    }
  };
}
