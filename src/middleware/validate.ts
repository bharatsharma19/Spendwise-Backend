import { NextFunction, Request, Response } from 'express';
import Joi from 'joi';
import { ValidationError } from '../utils/error';

// Cache for compiled schemas to improve performance
const schemaCache = new Map<string, Joi.ObjectSchema>();

// Validation constants
export const VALIDATION_CONSTANTS = {
  // Authentication
  PASSWORD_MIN_LENGTH: 8,
  PASSWORD_MAX_LENGTH: 128,
  NAME_MAX_LENGTH: 50,
  DESCRIPTION_MAX_LENGTH: 500,
  PHONE_REGEX: /^\+[1-9]\d{1,14}$/,
  VERIFICATION_CODE_LENGTH: 6,
  GROUP_CODE_LENGTH: 8,

  // Data limits
  MAX_TAGS: 10,
  MAX_GROUP_MEMBERS: 50,
  CURRENCY_LENGTH: 3,
  LANGUAGE_LENGTH: 2,

  // Enums
  CATEGORIES: [
    'food',
    'transportation',
    'housing',
    'utilities',
    'entertainment',
    'healthcare',
    'shopping',
    'education',
    'other',
  ] as const,

  FREQUENCIES: ['daily', 'weekly', 'monthly', 'yearly'] as const,
  SPLIT_TYPES: ['equal', 'percentage', 'custom'] as const,
  THEMES: ['light', 'dark', 'system'] as const,
  EXPENSE_STATUSES: ['pending', 'paid', 'cancelled'] as const,
} as const;

// Validation middleware with caching and detailed error messages
export const validate = (
  schema: Joi.ObjectSchema
): ((req: Request, _res: Response, next: NextFunction) => void) => {
  // Cache the schema for reuse
  const schemaKey = JSON.stringify(schema.describe());
  if (!schemaCache.has(schemaKey)) {
    schemaCache.set(schemaKey, schema);
  }
  const cachedSchema = schemaCache.get(schemaKey)!;

  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      const { error, value } = cachedSchema.validate(req.body, {
        abortEarly: false, // Return all errors, not just the first one
        stripUnknown: true, // Remove unknown fields
        convert: true, // Convert values when possible (e.g., string to number)
      });

      if (error) {
        const errors = error.details.map((detail) => ({
          field: detail.path.join('.'),
          message: detail.message,
          type: detail.type,
        }));

        return next(new ValidationError('Validation failed', errors));
      }

      // Replace request body with validated and sanitized data
      req.body = value;
      next();
    } catch (err) {
      next(new ValidationError('Invalid request data', []));
    }
  };
};

// Validation schemas with constants
export const schemas = {
  // Authentication schemas
  register: Joi.object({
    email: Joi.string().email().required().trim().lowercase(),
    password: Joi.string()
      .min(VALIDATION_CONSTANTS.PASSWORD_MIN_LENGTH)
      .max(VALIDATION_CONSTANTS.PASSWORD_MAX_LENGTH)
      .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]+$/)
      .required()
      .messages({
        'string.pattern.base':
          'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character',
      }),
    phoneNumber: Joi.string().pattern(VALIDATION_CONSTANTS.PHONE_REGEX).required().messages({
      'string.pattern.base': 'Phone number must be in E.164 format (e.g., +1234567890)',
    }),
    displayName: Joi.string().max(VALIDATION_CONSTANTS.NAME_MAX_LENGTH).trim(),
  }),

  login: Joi.object({
    email: Joi.string().email().required().trim().lowercase(),
    password: Joi.string().required(),
  }),

  verifyPhone: Joi.object({
    phoneNumber: Joi.string().pattern(VALIDATION_CONSTANTS.PHONE_REGEX).required().messages({
      'string.pattern.base': 'Phone number must be in E.164 format (e.g., +1234567890)',
    }),
  }),

  verifyPhoneCode: Joi.object({
    phoneNumber: Joi.string().pattern(VALIDATION_CONSTANTS.PHONE_REGEX).required().messages({
      'string.pattern.base': 'Phone number must be in E.164 format (e.g., +1234567890)',
    }),
    code: Joi.string()
      .length(VALIDATION_CONSTANTS.VERIFICATION_CODE_LENGTH)
      .pattern(/^\d+$/)
      .required()
      .messages({
        'string.length': 'Verification code must be {{#limit}} digits',
        'string.pattern.base': 'Verification code must contain only numbers',
      }),
  }),

  resetPassword: Joi.object({
    email: Joi.string().email().required().trim().lowercase(),
  }),

  resendEmailVerification: Joi.object({
    email: Joi.string().email().required().trim().lowercase(),
  }),

  // Expense schemas
  createExpense: Joi.object({
    amount: Joi.number().positive().required().precision(2),
    currency: Joi.string().length(VALIDATION_CONSTANTS.CURRENCY_LENGTH).uppercase().required(),
    category: Joi.string()
      .valid(...VALIDATION_CONSTANTS.CATEGORIES)
      .allow('') // Allow blank category
      .optional() // Make it optional to allow custom categories
      .custom((value) => {
        // If provided and not blank, allow any string (custom category) or validate against known
        if (value && value.trim() !== '') {
          return value; // Allow custom categories
        }
        return value; // Allow blank/empty
      }),
    description: Joi.string().max(VALIDATION_CONSTANTS.DESCRIPTION_MAX_LENGTH).required().trim(),
    date: Joi.date().iso().required().max('now'),
    location: Joi.object({
      latitude: Joi.number().min(-90).max(90),
      longitude: Joi.number().min(-180).max(180),
      address: Joi.string().trim(),
    }),
    tags: Joi.array().items(Joi.string().trim()).max(VALIDATION_CONSTANTS.MAX_TAGS).unique(),
    receiptUrl: Joi.string().uri(),
    isRecurring: Joi.boolean().required(),
    recurringDetails: Joi.object({
      frequency: Joi.string()
        .valid(...VALIDATION_CONSTANTS.FREQUENCIES)
        .required(),
      nextDueDate: Joi.date().iso().required().min('now'),
      endDate: Joi.date().iso().min(Joi.ref('nextDueDate')),
    }).when('isRecurring', {
      is: true,
      then: Joi.required(),
    }),
    isSplit: Joi.boolean(),
    splitDetails: Joi.object({
      splits: Joi.array()
        .items(
          Joi.object({
            userId: Joi.string().required(),
            amount: Joi.number().positive().required().precision(2),
          })
        )
        .min(1)
        .required(),
    }).when('isSplit', {
      is: true,
      then: Joi.required(),
    }),
  }),

  updateExpense: Joi.object({
    amount: Joi.number().positive().precision(2),
    currency: Joi.string().length(VALIDATION_CONSTANTS.CURRENCY_LENGTH).uppercase(),
    category: Joi.string()
      .valid(...VALIDATION_CONSTANTS.CATEGORIES)
      .allow('') // Allow blank category
      .optional() // Make it optional to allow custom categories
      .custom((value) => {
        // If provided and not blank, allow any string (custom category)
        if (value && value.trim() !== '') {
          return value; // Allow custom categories
        }
        return value; // Allow blank/empty
      }),
    description: Joi.string().max(VALIDATION_CONSTANTS.DESCRIPTION_MAX_LENGTH).trim(),
    date: Joi.date().iso().max('now'),
    location: Joi.object({
      latitude: Joi.number().min(-90).max(90),
      longitude: Joi.number().min(-180).max(180),
      address: Joi.string().trim(),
    }),
    tags: Joi.array().items(Joi.string().trim()).max(VALIDATION_CONSTANTS.MAX_TAGS).unique(),
    receiptUrl: Joi.string().uri(),
    isRecurring: Joi.boolean(),
    recurringDetails: Joi.object({
      frequency: Joi.string()
        .valid(...VALIDATION_CONSTANTS.FREQUENCIES)
        .required(),
      nextDueDate: Joi.date().iso().required().min('now'),
      endDate: Joi.date().iso().min(Joi.ref('nextDueDate')),
    }).when('isRecurring', {
      is: true,
      then: Joi.required(),
    }),
    isSplit: Joi.boolean(),
    splitDetails: Joi.object({
      splits: Joi.array()
        .items(
          Joi.object({
            userId: Joi.string().required(),
            amount: Joi.number().positive().required().precision(2),
          })
        )
        .min(1)
        .required(),
    }).when('isSplit', {
      is: true,
      then: Joi.required(),
    }),
  }),

  updateExpenseSplitStatus: Joi.object({
    splitUserId: Joi.string().required(),
    status: Joi.string()
      .valid(...VALIDATION_CONSTANTS.EXPENSE_STATUSES)
      .required(),
  }),

  // User schemas
  updateUser: Joi.object({
    displayName: Joi.string().max(VALIDATION_CONSTANTS.NAME_MAX_LENGTH).trim(),
    phoneNumber: Joi.string().pattern(VALIDATION_CONSTANTS.PHONE_REGEX).messages({
      'string.pattern.base': 'Phone number must be in E.164 format (e.g., +1234567890)',
    }),
    photoURL: Joi.string().uri(),
    preferences: Joi.object({
      currency: Joi.string().length(VALIDATION_CONSTANTS.CURRENCY_LENGTH).uppercase(),
      language: Joi.string().length(VALIDATION_CONSTANTS.LANGUAGE_LENGTH).lowercase(),
      notifications: Joi.object({
        email: Joi.boolean(),
        push: Joi.boolean(),
        sms: Joi.boolean(),
      }),
      theme: Joi.string().valid(...VALIDATION_CONSTANTS.THEMES),
      budgetAlerts: Joi.boolean(),
      monthlyBudget: Joi.number().positive().precision(2),
    }),
  }),

  // Group schemas
  createGroup: Joi.object({
    name: Joi.string().max(VALIDATION_CONSTANTS.NAME_MAX_LENGTH).required().trim(),
    description: Joi.string().max(VALIDATION_CONSTANTS.DESCRIPTION_MAX_LENGTH).trim(),
    currency: Joi.string().length(VALIDATION_CONSTANTS.CURRENCY_LENGTH).uppercase().required(),
    settings: Joi.object({
      allowMemberInvites: Joi.boolean(),
      requireApproval: Joi.boolean(),
      defaultSplitType: Joi.string().valid(...VALIDATION_CONSTANTS.SPLIT_TYPES),
    }),
  }),

  joinGroup: Joi.object({
    code: Joi.string()
      .length(VALIDATION_CONSTANTS.GROUP_CODE_LENGTH)
      .pattern(/^[A-Z0-9]+$/)
      .required()
      .messages({
        'string.length': 'Group code must be {{#limit}} characters',
        'string.pattern.base': 'Group code must contain only uppercase letters and numbers',
      }),
  }),

  addGroupExpense: Joi.object({
    amount: Joi.number().positive().required().precision(2),
    currency: Joi.string().length(VALIDATION_CONSTANTS.CURRENCY_LENGTH).uppercase().required(),
    category: Joi.string()
      .valid(...VALIDATION_CONSTANTS.CATEGORIES)
      .required(),
    description: Joi.string().max(VALIDATION_CONSTANTS.DESCRIPTION_MAX_LENGTH).required().trim(),
    date: Joi.date().iso().required().max('now'),
    location: Joi.object({
      latitude: Joi.number().min(-90).max(90),
      longitude: Joi.number().min(-180).max(180),
      address: Joi.string().trim(),
    }),
    tags: Joi.array().items(Joi.string().trim()).max(VALIDATION_CONSTANTS.MAX_TAGS).unique(),
    receiptUrl: Joi.string().uri(),
    splits: Joi.array()
      .items(
        Joi.object({
          userId: Joi.string().required(),
          amount: Joi.number().positive().required().precision(2),
        })
      )
      .min(1)
      .max(VALIDATION_CONSTANTS.MAX_GROUP_MEMBERS)
      .required(),
  }),
};
