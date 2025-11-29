import { supabase } from '../config/supabase';
import { Notification } from '../models/notification.model';
import {
  CreateUserDto,
  UpdateUserDto,
  User,
  UserPreferences,
  UserResponse,
} from '../models/user.model';
import { AppError, ErrorType, HttpStatusCode } from '../utils/error';
import { BaseService } from './base.service';

interface UserProfile {
  displayName?: string;
  photoURL?: string;
  phoneNumber?: string;
}

interface UserSettings {
  emailNotifications?: boolean;
  pushNotifications?: boolean;
  smsNotifications?: boolean;
  privacySettings?: {
    showProfile?: boolean;
    showExpenses?: boolean;
    showGroups?: boolean;
  };
  securitySettings?: {
    twoFactorAuth?: boolean;
    biometricAuth?: boolean;
    loginNotifications?: boolean;
  };
}

interface UserStats {
  totalExpenses: number;
  totalGroups: number;
  totalFriends: number;
  monthlySpending: number;
  categoryBreakdown: {
    [category: string]: number;
  };
}

export class UserService extends BaseService {
  private static instance: UserService;

  private constructor() {
    super('profiles');
  }

  public static getInstance(): UserService {
    if (!UserService.instance) {
      UserService.instance = new UserService();
    }
    return UserService.instance;
  }

  // Note: User creation is handled by Supabase Auth and Triggers.
  // This method might be used for additional setup if needed, or can be deprecated.
  async createUser(createUserData: CreateUserDto): Promise<UserResponse> {
    // In Supabase, we don't create users manually in the 'profiles' table usually,
    // the trigger does it. But if we need to update the profile immediately after signup:
    try {
      // Wait a bit for trigger or just upsert
      const { data, error } = await supabase
        .from('profiles')
        .update({
          display_name: createUserData.displayName,
          phone_number: createUserData.phoneNumber,
          updated_at: new Date().toISOString(),
        })
        .eq('email', createUserData.email) // Assuming email is unique and populated
        .select()
        .single();

      if (error) {
        // If trigger hasn't run yet, we might need to wait or handle it.
        // For now, let's assume the auth controller handles the signup and we just return the profile.
        throw new AppError(
          'Failed to setup user profile',
          HttpStatusCode.INTERNAL_SERVER_ERROR,
          ErrorType.DATABASE
        );
      }

      return this.transformUserResponse(data as User);
    } catch (error) {
      throw new AppError(
        'Failed to create user',
        HttpStatusCode.INTERNAL_SERVER_ERROR,
        ErrorType.DATABASE
      );
    }
  }

  async getUserById(uid: string): Promise<UserResponse> {
    try {
      const user = await this.getDocument<User>(uid);
      return this.transformUserResponse(user);
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError(
        'Failed to get user',
        HttpStatusCode.INTERNAL_SERVER_ERROR,
        ErrorType.DATABASE
      );
    }
  }

  async getUserByEmail(email: string): Promise<UserResponse> {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('email', email)
        .single();

      if (error || !data) {
        throw new AppError('User not found', HttpStatusCode.NOT_FOUND, ErrorType.NOT_FOUND);
      }
      return this.transformUserResponse(data as User);
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError(
        'Failed to get user',
        HttpStatusCode.INTERNAL_SERVER_ERROR,
        ErrorType.DATABASE
      );
    }
  }

  async generateAuthToken(_uid: string): Promise<string> {
    // Supabase handles tokens. This might be needed for custom flows but usually client handles it.
    // If we need to mint a token server-side, we need supabase-admin.
    // However, typically the client logs in.
    throw new AppError(
      'Generate auth token not supported in Supabase migration yet',
      HttpStatusCode.NOT_IMPLEMENTED,
      ErrorType.AUTHENTICATION
    );
  }

  async updatePhoneVerification(phoneNumber: string, isVerified: boolean): Promise<void> {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .update({ is_phone_verified: isVerified })
        .eq('phone_number', phoneNumber)
        .select();

      if (error || !data || data.length === 0) {
        throw new AppError('User not found', HttpStatusCode.NOT_FOUND, ErrorType.NOT_FOUND);
      }
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError(
        'Failed to update phone verification',
        HttpStatusCode.INTERNAL_SERVER_ERROR,
        ErrorType.DATABASE
      );
    }
  }

  async sendPasswordResetEmail(email: string): Promise<void> {
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email);
      if (error) throw error;
    } catch (error) {
      throw new AppError(
        'Failed to send password reset email',
        HttpStatusCode.INTERNAL_SERVER_ERROR,
        ErrorType.AUTHENTICATION
      );
    }
  }

  async updateUser(uid: string, updateData: UpdateUserDto): Promise<UserResponse> {
    try {
      const updateFields: any = {
        updated_at: new Date().toISOString(),
      };

      if (updateData.displayName) updateFields.display_name = updateData.displayName;
      if (updateData.phoneNumber) updateFields.phone_number = updateData.phoneNumber;
      if (updateData.photoURL) updateFields.photo_url = updateData.photoURL;
      if (updateData.preferences) {
        // Fetch current preferences to merge
        const currentUser = await this.getDocument<User>(uid);
        updateFields.preferences = {
          ...currentUser.preferences,
          ...updateData.preferences,
        };
      }

      const updatedUser = await this.updateDocument<User>(uid, updateFields);
      return this.transformUserResponse(updatedUser);
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError(
        'Failed to update user',
        HttpStatusCode.INTERNAL_SERVER_ERROR,
        ErrorType.DATABASE
      );
    }
  }

  async deleteUser(uid: string): Promise<void> {
    try {
      const { error } = await supabase.auth.admin.deleteUser(uid);
      if (error) throw error;
      // Profile deletion should cascade if configured, or we delete it manually
      await this.deleteDocument(uid);
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError(
        'Failed to delete user',
        HttpStatusCode.INTERNAL_SERVER_ERROR,
        ErrorType.DATABASE
      );
    }
  }

  async updateUserPreferences(
    uid: string,
    preferences: Partial<UserPreferences>
  ): Promise<UserResponse> {
    try {
      const user = await this.getDocument<User>(uid);
      const updatedPreferences = {
        ...user.preferences,
        ...preferences,
      };

      const updatedUser = await this.updateDocument<User>(uid, {
        preferences: updatedPreferences,
        updated_at: new Date().toISOString(),
      });
      return this.transformUserResponse(updatedUser);
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError(
        'Failed to update user preferences',
        HttpStatusCode.INTERNAL_SERVER_ERROR,
        ErrorType.DATABASE
      );
    }
  }

  private transformUserResponse(user: User): UserResponse {
    return {
      ...user,
      createdAt: new Date(user.created_at),
      updatedAt: new Date(user.updated_at),
      lastLoginAt: user.last_login_at ? new Date(user.last_login_at) : undefined,
    };
  }

  async getProfile(userId: string): Promise<UserResponse> {
    return this.getUserById(userId);
  }

  async updateProfile(userId: string, data: UserProfile): Promise<UserResponse> {
    const updateData: any = {};
    if (data.displayName) updateData.display_name = data.displayName;
    if (data.photoURL) updateData.photo_url = data.photoURL;
    if (data.phoneNumber) updateData.phone_number = data.phoneNumber;

    const updatedUser = await this.updateDocument<User>(userId, updateData);
    return this.transformUserResponse(updatedUser);
  }

  async updatePreferences(userId: string, data: UserPreferences): Promise<UserPreferences> {
    const user = await this.updateUserPreferences(userId, data);
    return user.preferences;
  }

  async updateSettings(userId: string, data: UserSettings): Promise<UserSettings> {
    // Assuming settings is another JSONB column or merged into preferences
    // For now, let's assume it's in preferences or a separate column 'settings'
    // The model didn't show 'settings' but the interface does.
    // I'll assume it's a column 'settings'
    try {
      const user = await this.getDocument<User & { settings: UserSettings }>(userId);
      const updatedSettings = {
        ...user.settings,
        ...data,
      };
      await this.updateDocument(userId, { settings: updatedSettings });
      return updatedSettings;
    } catch (error) {
      throw new AppError(
        'Failed to update settings',
        HttpStatusCode.INTERNAL_SERVER_ERROR,
        ErrorType.DATABASE
      );
    }
  }

  async getNotifications(userId: string): Promise<Notification[]> {
    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      throw new AppError(
        'Failed to get notifications',
        HttpStatusCode.INTERNAL_SERVER_ERROR,
        ErrorType.DATABASE
      );
    }
    return (data || []).map((n) => ({
      ...n,
      userId: n.user_id,
      createdAt: new Date(n.created_at),
      updatedAt: new Date(n.updated_at),
    })) as unknown as Notification[];
  }

  async markNotificationAsRead(userId: string, notificationId: string): Promise<Notification> {
    const { data, error } = await supabase
      .from('notifications')
      .update({ read: true, updated_at: new Date().toISOString() })
      .eq('id', notificationId)
      .eq('user_id', userId) // Security check
      .select()
      .single();

    if (error) {
      throw new AppError(
        'Failed to mark notification as read',
        HttpStatusCode.INTERNAL_SERVER_ERROR,
        ErrorType.DATABASE
      );
    }
    return {
      ...data,
      userId: data.user_id,
      createdAt: new Date(data.created_at),
      updatedAt: new Date(data.updated_at),
    } as unknown as Notification;
  }

  async deleteNotification(userId: string, notificationId: string): Promise<void> {
    const { error } = await supabase
      .from('notifications')
      .delete()
      .eq('id', notificationId)
      .eq('user_id', userId);

    if (error) {
      throw new AppError(
        'Failed to delete notification',
        HttpStatusCode.INTERNAL_SERVER_ERROR,
        ErrorType.DATABASE
      );
    }
  }

  async getUserStats(userId: string): Promise<UserStats> {
    try {
      // Parallel queries
      const [expensesResult, groupsResult, friendsResult] = await Promise.all([
        supabase.from('expenses').select('amount, category').eq('user_id', userId),
        supabase.from('group_members').select('id', { count: 'exact' }).eq('user_id', userId),
        supabase.from('friends').select('id', { count: 'exact' }).eq('user_id', userId),
      ]);

      const expenses = expensesResult.data || [];
      const totalExpenses = expenses.length;
      const monthlySpending = expenses.reduce(
        (sum: number, expense: any) => sum + expense.amount,
        0
      );

      const categoryBreakdown = expenses.reduce(
        (acc: any, expense: any) => {
          acc[expense.category] = (acc[expense.category] || 0) + expense.amount;
          return acc;
        },
        {} as { [category: string]: number }
      );

      return {
        totalExpenses,
        totalGroups: groupsResult.count || 0,
        totalFriends: friendsResult.count || 0,
        monthlySpending,
        categoryBreakdown,
      };
    } catch (error) {
      throw new AppError(
        'Failed to get user stats',
        HttpStatusCode.INTERNAL_SERVER_ERROR,
        ErrorType.DATABASE
      );
    }
  }
}
