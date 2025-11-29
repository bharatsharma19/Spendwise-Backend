import { Timestamp, WhereFilterOp } from 'firebase-admin/firestore';
import { auth, db } from '../config/firebase';
import { CreateUserDto, UpdateUserDto, User, UserResponse } from '../models/user.model';
import {
  AppError,
  AuthorizationError,
  ErrorType,
  HttpStatusCode,
  NotFoundError,
} from '../utils/error';
import { BaseService } from './base.service';

interface UserProfile {
  displayName?: string;
  photoURL?: string;
  phoneNumber?: string;
}

interface UserPreferences {
  currency?: string;
  language?: string;
  notifications?: {
    email?: boolean;
    push?: boolean;
    sms?: boolean;
  };
  theme?: 'light' | 'dark' | 'system';
  budgetAlerts?: boolean;
  monthlyBudget?: number;
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
    super('users');
  }

  public static getInstance(): UserService {
    if (!UserService.instance) {
      UserService.instance = new UserService();
    }
    return UserService.instance;
  }

  async createUser(createUserData: CreateUserDto): Promise<UserResponse> {
    try {
      // Create user in Firebase Auth
      const userRecord = await auth.createUser({
        email: createUserData.email,
        password: createUserData.password,
        phoneNumber: createUserData.phoneNumber,
        displayName: createUserData.displayName,
      });

      // Default user preferences
      const defaultPreferences = {
        currency: 'INR',
        language: 'en',
        notifications: {
          email: true,
          push: true,
          sms: false,
        },
        theme: 'system' as const,
        budgetAlerts: true,
      };

      // Create user document in Firestore
      const userData = {
        uid: userRecord.uid,
        email: createUserData.email,
        phoneNumber: createUserData.phoneNumber,
        displayName: createUserData.displayName,
        preferences: defaultPreferences,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
        isEmailVerified: false,
        isPhoneVerified: false,
        status: 'active' as const,
      };

      const createdUser = await this.createDocument<User>(userData);
      return this.transformUserResponse(createdUser);
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
      const users = await this.getCollection<User>([
        { field: 'email', operator: '==' as WhereFilterOp, value: email },
      ]);
      if (users.length === 0) {
        throw new AppError('User not found', HttpStatusCode.NOT_FOUND, ErrorType.NOT_FOUND);
      }
      const user = users[0];
      if (!user) {
        throw new AppError('User not found', HttpStatusCode.NOT_FOUND, ErrorType.NOT_FOUND);
      }
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

  async generateAuthToken(uid: string): Promise<string> {
    try {
      return await auth.createCustomToken(uid);
    } catch (error) {
      throw new AppError(
        'Failed to generate auth token',
        HttpStatusCode.INTERNAL_SERVER_ERROR,
        ErrorType.AUTHENTICATION
      );
    }
  }

  async updatePhoneVerification(phoneNumber: string, isVerified: boolean): Promise<void> {
    try {
      const users = await this.getCollection<User>([
        { field: 'phoneNumber', operator: '==' as WhereFilterOp, value: phoneNumber },
      ]);
      if (users.length === 0) {
        throw new AppError('User not found', HttpStatusCode.NOT_FOUND, ErrorType.NOT_FOUND);
      }
      const user = users[0];
      if (!user) {
        throw new AppError('User not found', HttpStatusCode.NOT_FOUND, ErrorType.NOT_FOUND);
      }
      await this.updateDocument<User>(user.uid, { isPhoneVerified: isVerified });
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
      await auth.generatePasswordResetLink(email);
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
      const user = await this.getDocument<User>(uid);
      const updateFields: Partial<User> = {
        updatedAt: Timestamp.now(),
      };

      if (updateData.displayName) updateFields.displayName = updateData.displayName;
      if (updateData.phoneNumber) updateFields.phoneNumber = updateData.phoneNumber;
      if (updateData.photoURL) updateFields.photoURL = updateData.photoURL;
      if (updateData.preferences) {
        updateFields.preferences = {
          ...user.preferences,
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
      await this.getDocument<User>(uid); // Check if user exists
      await this.deleteDocument(uid);
      await auth.deleteUser(uid);
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
    preferences: Partial<User['preferences']>
  ): Promise<UserResponse> {
    try {
      const user = await this.getDocument<User>(uid);
      const updatedPreferences = {
        ...user.preferences,
        ...preferences,
      };

      const updatedUser = await this.updateDocument<User>(uid, {
        preferences: updatedPreferences,
        updatedAt: Timestamp.now(),
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
      createdAt: user.createdAt.toDate(),
      updatedAt: user.updatedAt.toDate(),
      lastLoginAt: user.lastLoginAt?.toDate(),
    };
  }

  async getProfile(userId: string) {
    const userRef = db.collection('users').doc(userId);
    const user = await userRef.get();

    if (!user.exists) {
      throw new NotFoundError('User not found');
    }

    return {
      id: user.id,
      ...user.data(),
    };
  }

  async updateProfile(userId: string, data: UserProfile) {
    const userRef = db.collection('users').doc(userId);
    const user = await userRef.get();

    if (!user.exists) {
      throw new NotFoundError('User not found');
    }

    const updateData = {
      ...data,
      updatedAt: Timestamp.now(),
    };

    await userRef.update(updateData);

    const updatedUser = await userRef.get();
    return {
      id: updatedUser.id,
      ...updatedUser.data(),
    };
  }

  async updatePreferences(userId: string, data: UserPreferences) {
    const userRef = db.collection('users').doc(userId);
    const user = await userRef.get();

    if (!user.exists) {
      throw new NotFoundError('User not found');
    }

    const updateData = {
      preferences: {
        ...user.data()?.preferences,
        ...data,
      },
      updatedAt: Timestamp.now(),
    };

    await userRef.update(updateData);

    const updatedUser = await userRef.get();
    return updatedUser.data()?.preferences;
  }

  async updateSettings(userId: string, data: UserSettings) {
    const userRef = db.collection('users').doc(userId);
    const user = await userRef.get();

    if (!user.exists) {
      throw new NotFoundError('User not found');
    }

    const updateData = {
      settings: {
        ...user.data()?.settings,
        ...data,
      },
      updatedAt: Timestamp.now(),
    };

    await userRef.update(updateData);

    const updatedUser = await userRef.get();
    return updatedUser.data()?.settings;
  }

  async getNotifications(userId: string) {
    const notificationsRef = db.collection('notifications').where('userId', '==', userId);
    const snapshot = await notificationsRef.orderBy('createdAt', 'desc').get();

    return snapshot.docs.map((doc: any) => ({
      id: doc.id,
      ...doc.data(),
    }));
  }

  async markNotificationAsRead(userId: string, notificationId: string) {
    const notificationRef = db.collection('notifications').doc(notificationId);
    const notification = await notificationRef.get();

    if (!notification.exists) {
      throw new NotFoundError('Notification not found');
    }

    const notificationData = notification.data();
    if (notificationData?.userId !== userId) {
      throw new AuthorizationError('Unauthorized access');
    }

    const updateData = {
      read: true,
      updatedAt: Timestamp.now(),
    };

    await notificationRef.update(updateData);

    const updatedNotification = await notificationRef.get();
    return {
      id: updatedNotification.id,
      ...updatedNotification.data(),
    };
  }

  async deleteNotification(userId: string, notificationId: string) {
    const notificationRef = db.collection('notifications').doc(notificationId);
    const notification = await notificationRef.get();

    if (!notification.exists) {
      throw new NotFoundError('Notification not found');
    }

    const notificationData = notification.data();
    if (notificationData?.userId !== userId) {
      throw new AuthorizationError('Unauthorized access');
    }

    await notificationRef.delete();
  }

  async getUserStats(userId: string): Promise<UserStats> {
    const [expensesSnapshot, groupsSnapshot, friendsSnapshot] = await Promise.all([
      db.collection('expenses').where('userId', '==', userId).get(),
      db.collection('groups').where('members', 'array-contains', userId).get(),
      db.collection('users').doc(userId).collection('friends').get(),
    ]);

    const expenses = expensesSnapshot.docs.map((doc: any) => doc.data());
    const totalExpenses = expenses.length;
    const monthlySpending = expenses.reduce((sum: any, expense: any) => sum + expense.amount, 0);

    const categoryBreakdown = expenses.reduce(
      (acc: any, expense: any) => {
        acc[expense.category] = (acc[expense.category] || 0) + expense.amount;
        return acc;
      },
      {} as { [category: string]: number }
    );

    return {
      totalExpenses,
      totalGroups: groupsSnapshot.size,
      totalFriends: friendsSnapshot.size,
      monthlySpending,
      categoryBreakdown,
    };
  }
}
