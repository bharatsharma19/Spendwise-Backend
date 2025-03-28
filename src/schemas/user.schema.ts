import Joi from 'joi';

export const updateProfileSchema = Joi.object({
  displayName: Joi.string().min(2).max(50).optional(),
  email: Joi.string().email().optional(),
  phoneNumber: Joi.string()
    .pattern(/^\+?[1-9]\d{1,14}$/)
    .optional(),
  photoURL: Joi.string().uri().optional(),
});

export const userPreferencesSchema = Joi.object({
  theme: Joi.string().valid('light', 'dark', 'system').default('system'),
  notifications: Joi.object({
    email: Joi.boolean().default(true),
    push: Joi.boolean().default(true),
  }).default(),
  currency: Joi.string().default('INR'),
  language: Joi.string().default('en'),
});
