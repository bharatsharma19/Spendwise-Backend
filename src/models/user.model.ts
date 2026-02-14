export interface UserPreferences {
  currency: string;
  language: string;
  notifications: {
    email: boolean;
    push: boolean;
    sms: boolean;
  };
  theme: 'light' | 'dark' | 'system';
  budgetAlerts: boolean;
  monthlyBudget?: number;
  lastBudgetAlert?: {
    month: string; // YYYY-MM
    percentage: number; // 80, 90, 100
    sentAt: Date;
  };
}

export interface User {
  uid: string;
  email: string;
  phoneNumber: string;
  displayName?: string;
  photoURL?: string;
  preferences: UserPreferences;
  created_at: string;
  updated_at: string;
  last_login_at?: string;
  isEmailVerified: boolean;
  isPhoneVerified: boolean;
  status: 'active' | 'inactive' | 'suspended';
}

export interface CreateUserDto {
  email: string;
  password: string;
  phoneNumber: string;
  displayName?: string;
}

export interface UpdateUserDto {
  displayName?: string;
  phoneNumber?: string;
  photoURL?: string;
  preferences?: Partial<UserPreferences>;
}

export interface UserResponse {
  uid: string;
  email: string;
  phoneNumber: string;
  displayName?: string;
  photoURL?: string;
  preferences: UserPreferences;
  createdAt: Date;
  updatedAt: Date;
  lastLoginAt?: Date;
  isEmailVerified: boolean;
  isPhoneVerified: boolean;
  status: 'active' | 'inactive' | 'suspended';
}
