import Joi from 'joi';

export const userSchema = {
  updateProfile: Joi.object({
    displayName: Joi.string().trim().min(2).max(50),
    photoURL: Joi.string().uri(),
    phoneNumber: Joi.string().pattern(/^\+[1-9]\d{1,14}$/),
  }),

  updatePreferences: Joi.object({
    currency: Joi.string().trim().uppercase().length(3),
    language: Joi.string().trim().length(2),
    notifications: Joi.object({
      email: Joi.boolean(),
      push: Joi.boolean(),
      sms: Joi.boolean(),
    }),
    theme: Joi.string().valid('light', 'dark', 'system'),
    budgetAlerts: Joi.boolean(),
    monthlyBudget: Joi.number().min(0).precision(2),
  }),

  updateSettings: Joi.object({
    emailNotifications: Joi.boolean(),
    pushNotifications: Joi.boolean(),
    smsNotifications: Joi.boolean(),
    privacySettings: Joi.object({
      showProfile: Joi.boolean(),
      showExpenses: Joi.boolean(),
      showGroups: Joi.boolean(),
    }),
    securitySettings: Joi.object({
      twoFactorAuth: Joi.boolean(),
      biometricAuth: Joi.boolean(),
      loginNotifications: Joi.boolean(),
    }),
  }),
};
