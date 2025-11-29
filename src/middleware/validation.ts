import { NextFunction, Request, Response } from 'express';
import Joi from 'joi';
import { ValidationError, ValidationErrorDetail } from '../utils/error';

export const validateRequest = (
  schema: Joi.ObjectSchema
): ((req: Request, _res: Response, next: NextFunction) => void) => {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const { error } = schema.validate(req.body, {
      abortEarly: false,
      stripUnknown: true,
    });

    if (error) {
      const errors = error.details.map((detail) => {
        const field = detail.path.join('.');
        return new ValidationErrorDetail(field, detail.message);
      });
      next(new ValidationError('Validation failed', errors));
      return;
    }

    next();
  };
};
