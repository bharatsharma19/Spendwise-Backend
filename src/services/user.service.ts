import { env } from '../config/env.config';
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
import { logger } from '../utils/logger';
import { BaseService } from './base.service';
import { EmailService } from './email.service';

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
  private readonly emailService: EmailService;

  private constructor() {
    super('profiles');
    this.emailService = EmailService.getInstance();
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

  async getUserByPhone(phoneNumber: string): Promise<UserResponse> {
    try {
      const formattedPhone = phoneNumber.startsWith('+') ? phoneNumber : `+${phoneNumber}`;
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('phone_number', formattedPhone)
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

  /**
   * Find user by email or phone, or create if not exists
   * If user is created, sends verification email/SMS
   */
  async findOrCreateUser(
    email?: string,
    phoneNumber?: string,
    displayName?: string
  ): Promise<{ user: UserResponse; isNewUser: boolean }> {
    try {
      // 1. Sanitize Inputs
      if (!email && !phoneNumber) {
        throw new AppError(
          'Either email or phoneNumber is required',
          HttpStatusCode.BAD_REQUEST,
          ErrorType.VALIDATION
        );
      }

      // Normalize phone: remove spaces/dashes, ensure + prefix if missing
      let formattedPhone: string | undefined;
      if (phoneNumber) {
        const cleaned = phoneNumber.replace(/[^0-9+]/g, '');
        formattedPhone = cleaned.startsWith('+') ? cleaned : `+${cleaned}`;
      }

      // 2. Try to find existing profile in DB first (Fastest)
      if (email) {
        try {
          const u = await this.getUserByEmail(email);
          return { user: u, isNewUser: false };
        } catch {}
      }
      if (formattedPhone) {
        try {
          const u = await this.getUserByPhone(formattedPhone);
          return { user: u, isNewUser: false };
        } catch {}
      }

      // 3. Prepare Auth Data
      // Use a consistent shadow email for phone-only users to allow easier lookup
      const effectiveEmail =
        email || `phone_${formattedPhone!.replace(/[^0-9]/g, '')}@shadow.spendwise.local`;
      const tempPassword = Math.random().toString(36).slice(-12) + 'A1!';

      let authUserId: string | undefined;
      let isNewAuth = false;

      // 4. Create or Find Auth User
      try {
        const { data: authData, error: authError } = await supabase.auth.admin.createUser({
          email: effectiveEmail,
          phone: formattedPhone, // Supabase handles E.164 validation
          password: tempPassword,
          email_confirm: true,
          phone_confirm: true,
          user_metadata: { display_name: displayName || 'Invited User' },
        });

        if (authError) throw authError;
        if (authData.user) {
          authUserId = authData.user.id;
          isNewAuth = true;
        }
      } catch (err: any) {
        // Only attempt to find existing user if the error specifically indicates duplication
        const status = err.status || err.code;
        const msg = (err.message || '').toLowerCase();

        const isDuplicate =
          status === 422 || msg.includes('already registered') || msg.includes('duplicate');

        if (!isDuplicate) {
          logger.error('Failed to create user (non-duplicate error):', err);
          throw new AppError(
            err.message || 'Failed to create user',
            typeof status === 'number' && status >= 400 && status < 600
              ? status
              : HttpStatusCode.INTERNAL_SERVER_ERROR,
            ErrorType.DATABASE
          );
        }

        // Handle "User already registered" - Robust finding
        const { data: listData } = await supabase.auth.admin.listUsers({ perPage: 1000 });

        const existing = listData.users.find((u) => {
          const emailMatch = u.email?.toLowerCase() === effectiveEmail.toLowerCase();

          let phoneMatch = false;
          if (formattedPhone && u.phone) {
            const p1 = formattedPhone.replace(/[^0-9]/g, '');
            const p2 = u.phone.replace(/[^0-9]/g, '');
            phoneMatch = p1 === p2;
          }

          return emailMatch || phoneMatch;
        });

        if (existing) {
          authUserId = existing.id;
        } else {
          logger.error(`Could not locate existing user: ${effectiveEmail} / ${formattedPhone}`);
          throw new AppError(
            'User already exists but could not be retrieved. Please try again.',
            HttpStatusCode.INTERNAL_SERVER_ERROR,
            ErrorType.DATABASE
          );
        }
      }

      if (!authUserId) throw new Error('User ID could not be determined');

      // 5. Create Profile (Upsert to handle race conditions)
      const { data: newProfile, error: profileError } = await supabase
        .from('profiles')
        .upsert({
          id: authUserId,
          email: effectiveEmail,
          phone_number: formattedPhone || '',
          display_name: displayName || 'Invited User',
          status: 'active',
          updated_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (profileError) {
        logger.error('Profile upsert failed', profileError);
        throw new AppError(
          'Failed to create profile',
          HttpStatusCode.INTERNAL_SERVER_ERROR,
          ErrorType.DATABASE
        );
      }

      const user = this.transformUserResponse(newProfile);

      // 6. Send Invite (Only for email magic links)
      // FIX: Removed Twilio OTP sending here. OTPs are synchronous for login only.
      // Phone users will get the "Group Invite" SMS from GroupService instead.
      if (isNewAuth || !user.lastLoginAt) {
        try {
          if (email) {
            const { data: linkData } = await supabase.auth.admin.generateLink({
              type: 'recovery',
              email: email,
              options: { redirectTo: `${env.FRONTEND_URL}/update-password` },
            });
            if (linkData.properties?.action_link) {
              await this.emailService.sendVerificationEmail(email, linkData.properties.action_link);
            }
          }
          // Note: No 'else if (formattedPhone)' block here anymore.
        } catch (notifyError) {
          logger.warn('Failed to send invite notification', { error: notifyError });
        }
      }

      return { user, isNewUser: isNewAuth };
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError(
        'User creation failed',
        HttpStatusCode.INTERNAL_SERVER_ERROR,
        ErrorType.DATABASE
      );
    }
  }

  async generateAuthToken(_uid: string): Promise<string> {
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
      const updateFields: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
      };

      if (updateData.displayName) updateFields.display_name = updateData.displayName;
      if (updateData.phoneNumber) updateFields.phone_number = updateData.phoneNumber;
      if (updateData.photoURL) updateFields.photo_url = updateData.photoURL;
      if (updateData.preferences) {
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

  private transformUserResponse(
    user: User | { id?: string; [key: string]: unknown }
  ): UserResponse {
    const dbUser = user as { id?: string; uid?: string; [key: string]: unknown };
    const uid = dbUser.uid || dbUser.id || '';

    const mappedUser: User = {
      uid,
      email: (dbUser.email as string) || '',
      phoneNumber: (dbUser.phone_number as string) || (dbUser.phoneNumber as string) || '',
      displayName: (dbUser.display_name as string) || (dbUser.displayName as string),
      photoURL: (dbUser.photo_url as string) || (dbUser.photoURL as string),
      preferences: (dbUser.preferences as UserPreferences) || {
        currency: 'INR',
        language: 'en',
        notifications: { email: true, push: true, sms: true },
        theme: 'system',
        budgetAlerts: true,
      },
      created_at: (dbUser.created_at as string) || new Date().toISOString(),
      updated_at: (dbUser.updated_at as string) || new Date().toISOString(),
      last_login_at: (dbUser.last_login_at as string) || undefined,
      isEmailVerified: (dbUser.is_email_verified as boolean) || false,
      isPhoneVerified: (dbUser.is_phone_verified as boolean) || false,
      status: (dbUser.status as 'active' | 'inactive' | 'suspended') || 'active',
    };

    return {
      ...mappedUser,
      createdAt: new Date(mappedUser.created_at),
      updatedAt: new Date(mappedUser.updated_at),
      lastLoginAt: mappedUser.last_login_at ? new Date(mappedUser.last_login_at) : undefined,
    };
  }

  async getProfile(userId: string): Promise<UserResponse> {
    return this.getUserById(userId);
  }

  async updateProfile(userId: string, data: UserProfile): Promise<UserResponse> {
    const updateData: Record<string, unknown> = {};
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
      .eq('user_id', userId)
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
      const [expensesResult, groupsResult, friendsResult] = await Promise.all([
        supabase.from('expenses').select('amount, category').eq('user_id', userId),
        supabase.from('group_members').select('id', { count: 'exact' }).eq('user_id', userId),
        supabase.from('friends').select('id', { count: 'exact' }).eq('user_id', userId),
      ]);

      const expenses = expensesResult.data || [];
      const totalExpenses = expenses.length;
      const monthlySpending = expenses.reduce(
        (sum: number, expense: { amount: number }) => sum + expense.amount,
        0
      );

      const categoryBreakdown = expenses.reduce(
        (acc: Record<string, number>, expense: { category: string; amount: number }) => {
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
