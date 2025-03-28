import Joi from 'joi';

export const expenseSchema = {
  createExpense: Joi.object({
    amount: Joi.number().required().min(0).precision(2),
    category: Joi.string().required().trim(),
    description: Joi.string().trim().max(500),
    date: Joi.date().required().iso(),
    currency: Joi.string().trim().uppercase().default('USD'),
    isRecurring: Joi.boolean().default(false),
    recurringFrequency: Joi.string()
      .valid('daily', 'weekly', 'monthly', 'yearly')
      .when('isRecurring', {
        is: true,
        then: Joi.required(),
      }),
    isSplit: Joi.boolean().default(false),
    splitWith: Joi.array().items(Joi.string().trim()).when('isSplit', {
      is: true,
      then: Joi.required(),
    }),
    splitAmount: Joi.number().min(0).precision(2).when('isSplit', {
      is: true,
      then: Joi.required(),
    }),
  }),

  updateExpense: Joi.object({
    amount: Joi.number().min(0).precision(2),
    category: Joi.string().trim(),
    description: Joi.string().trim().max(500),
    date: Joi.date().iso(),
    currency: Joi.string().trim().uppercase(),
    isRecurring: Joi.boolean(),
    recurringFrequency: Joi.string()
      .valid('daily', 'weekly', 'monthly', 'yearly')
      .when('isRecurring', {
        is: true,
        then: Joi.required(),
      }),
    isSplit: Joi.boolean(),
    splitWith: Joi.array().items(Joi.string().trim()).when('isSplit', {
      is: true,
      then: Joi.required(),
    }),
    splitAmount: Joi.number().min(0).precision(2).when('isSplit', {
      is: true,
      then: Joi.required(),
    }),
  }),

  updateExpenseSplitStatus: Joi.object({
    isSplit: Joi.boolean().required(),
  }),
};
