import { Request, Response, NextFunction } from 'express';
import Joi from 'joi';
import { ValidationError, ValidationErrorDetail } from '../utils/error';

export const validateRequest = (schema: Joi.ObjectSchema) => {
  return (req: Request, _res: Response, next: NextFunction) => {
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
