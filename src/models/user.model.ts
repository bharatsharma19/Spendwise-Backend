import { Timestamp } from "firebase-admin/firestore";

export interface UserPreferences {
  currency: string;
  language: string;
  notifications: {
    email: boolean;
    push: boolean;
    sms: boolean;
  };
  theme: "light" | "dark" | "system";
  budgetAlerts: boolean;
  monthlyBudget?: number;
}

export interface User {
  uid: string;
  email: string;
  phoneNumber: string;
  displayName?: string;
  photoURL?: string;
  preferences: UserPreferences;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  lastLoginAt?: Timestamp;
  isEmailVerified: boolean;
  isPhoneVerified: boolean;
  status: "active" | "inactive" | "suspended";
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
  status: "active" | "inactive" | "suspended";
}
