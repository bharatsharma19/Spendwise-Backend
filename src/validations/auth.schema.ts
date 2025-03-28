import Joi from 'joi';
import { VALIDATION_CONSTANTS } from '../middleware/validate';

export const authSchema = {
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
};
