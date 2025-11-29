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
import { TwilioService } from './twilio.service';

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
  private readonly twilioService: TwilioService;

  private constructor() {
    super('profiles');
    this.emailService = EmailService.getInstance();
    this.twilioService = TwilioService.getInstance();
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
      let user: UserResponse | null = null;

      // Try to find existing user
      if (email) {
        try {
          user = await this.getUserByEmail(email);
        } catch (error) {
          // User not found, will create
        }
      }

      if (!user && phoneNumber) {
        try {
          user = await this.getUserByPhone(phoneNumber);
        } catch (error) {
          // User not found, will create
        }
      }

      // If user exists, return it
      if (user) {
        return { user, isNewUser: false };
      }

      // User doesn't exist, create new user
      if (!email && !phoneNumber) {
        throw new AppError(
          'Either email or phoneNumber is required',
          HttpStatusCode.BAD_REQUEST,
          ErrorType.VALIDATION
        );
      }

      // Generate a temporary password (user will need to reset it)
      const tempPassword =
        Math.random().toString(36).slice(-12) + Math.random().toString(36).slice(-12) + 'A1!';

      const formattedPhone = phoneNumber
        ? phoneNumber.startsWith('+')
          ? phoneNumber
          : `+${phoneNumber}`
        : undefined;

      // Create user in Supabase Auth
      const { data: authData, error: authError } = await supabase.auth.admin.createUser({
        email: email || undefined,
        phone: formattedPhone || undefined,
        password: tempPassword,
        email_confirm: false, // User needs to verify
        phone_confirm: false, // User needs to verify
        user_metadata: {
          display_name: displayName || 'New User',
          phone_number: formattedPhone,
        },
      });

      if (authError || !authData.user) {
        // If phone/email already exists, try to find the existing user
        if (
          authError?.message?.includes('already registered') ||
          authError?.message?.includes('already exists')
        ) {
          // Try to find user by phone in Supabase Auth
          if (formattedPhone) {
            try {
              const { data: users } = await supabase.auth.admin.listUsers();
              const existingAuthUser = users.users.find(
                (u) => u.phone === formattedPhone || u.email === email
              );

              if (existingAuthUser) {
                // User exists in Auth, check if profile exists
                try {
                  const existingUser = await this.getUserById(existingAuthUser.id);
                  return { user: existingUser, isNewUser: false };
                } catch (profileLookupError) {
                  // Profile doesn't exist, create it
                  const userData = {
                    id: existingAuthUser.id,
                    email: existingAuthUser.email || email || '',
                    phone_number: existingAuthUser.phone || formattedPhone || '',
                    display_name:
                      displayName || existingAuthUser.user_metadata?.display_name || 'New User',
                    photo_url: '',
                    preferences: {
                      currency: 'INR',
                      language: 'en',
                      notifications: {
                        email: true,
                        push: true,
                        sms: true,
                      },
                      theme: 'system',
                      budgetAlerts: true,
                      monthlyBudget: 0,
                    },
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                    is_email_verified: existingAuthUser.email_confirmed_at ? true : false,
                    is_phone_verified: existingAuthUser.phone_confirmed_at ? true : false,
                    status: 'active',
                  };

                  const { data: profileData, error: profileError } = await supabase
                    .from('profiles')
                    .insert(userData)
                    .select()
                    .single();

                  if (profileError || !profileData) {
                    throw new AppError(
                      'Failed to create user profile',
                      HttpStatusCode.INTERNAL_SERVER_ERROR,
                      ErrorType.DATABASE
                    );
                  }

                  return { user: this.transformUserResponse(profileData), isNewUser: false };
                }
              }
            } catch (findError) {
              // If we can't find the user, throw the original error
            }
          }
        }

        throw new AppError(
          authError?.message || 'Failed to create user',
          HttpStatusCode.INTERNAL_SERVER_ERROR,
          ErrorType.DATABASE
        );
      }

      // Create user profile
      const userData = {
        id: authData.user.id,
        email: email || authData.user.email || '',
        phone_number: formattedPhone || authData.user.phone || '',
        display_name: displayName || 'New User',
        photo_url: '',
        preferences: {
          currency: 'INR',
          language: 'en',
          notifications: {
            email: true,
            push: true,
            sms: true,
          },
          theme: 'system',
          budgetAlerts: true,
          monthlyBudget: 0,
        },
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        is_email_verified: false,
        is_phone_verified: false,
        status: 'active',
      };

      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .insert(userData)
        .select()
        .single();

      if (profileError) {
        // If profile creation fails, try to clean up auth user
        await supabase.auth.admin.deleteUser(authData.user.id);
        throw new AppError(
          'Failed to create user profile',
          HttpStatusCode.INTERNAL_SERVER_ERROR,
          ErrorType.DATABASE
        );
      }

      if (!profileData) {
        throw new AppError(
          'Failed to create user profile',
          HttpStatusCode.INTERNAL_SERVER_ERROR,
          ErrorType.DATABASE
        );
      }

      user = this.transformUserResponse(profileData);

      // Send verification email/SMS for newly created users
      // Email: Send to users with email addresses
      // SMS: Send to users with phone numbers
      try {
        if (email) {
          // Generate password reset link (user will set password when they verify)
          const resetLink = `${env.FRONTEND_URL}/verify-email?token=${authData.user.id}`;
          try {
            await this.emailService.sendVerificationEmail(email, resetLink);
            logger.info(`Verification email sent to: ${email}`);
          } catch (emailError) {
            // Log error but don't fail user creation
            logger.error(`Failed to send verification email to ${email}`, { error: emailError });
          }
        }

        if (formattedPhone) {
          // Send OTP via SMS
          try {
            await this.twilioService.sendOTP(formattedPhone);
            logger.info(`Verification SMS sent to: ${formattedPhone}`);
          } catch (smsError) {
            // Log error but don't fail user creation
            logger.error(`Failed to send verification SMS to ${formattedPhone}`, {
              error: smsError,
            });
          }
        }
      } catch (notificationError) {
        // Log error but don't fail user creation
        logger.error('Failed to send verification notification', { error: notificationError });
      }

      return { user, isNewUser: true };
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError(
        'Failed to find or create user',
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
      const updateFields: Record<string, unknown> = {
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

  private transformUserResponse(
    user: User | { id?: string; [key: string]: unknown }
  ): UserResponse {
    // Map database 'id' to 'uid' if needed
    const dbUser = user as { id?: string; uid?: string; [key: string]: unknown };
    const uid = dbUser.uid || dbUser.id || '';

    // Map database field names to User interface
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
