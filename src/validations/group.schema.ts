import Joi from 'joi';
import { VALIDATION_CONSTANTS } from '../middleware/validate';

export const groupSchema = {
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

  addMember: Joi.object({
    email: Joi.string().email().trim().lowercase(),
    phoneNumber: Joi.string().pattern(VALIDATION_CONSTANTS.PHONE_REGEX).messages({
      'string.pattern.base': 'Phone number must be in E.164 format (e.g., +1234567890)',
    }),
    displayName: Joi.string().optional(),
  })
    .or('email', 'phoneNumber')
    .messages({
      'object.missing': 'Either email or phoneNumber is required',
    }),

  addGroupExpense: Joi.object({
    amount: Joi.number().positive().required().precision(2),
    currency: Joi.string().length(VALIDATION_CONSTANTS.CURRENCY_LENGTH).uppercase().required(),
    category: Joi.string().trim().allow('').optional(),
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
      .optional(),
  }),
};
