// HTTP Status Codes
export enum HttpStatusCode {
  BAD_REQUEST = 400,
  UNAUTHORIZED = 401,
  FORBIDDEN = 403,
  NOT_FOUND = 404,
  CONFLICT = 409,
  GONE = 410,
  NOT_IMPLEMENTED = 418,
  INTERNAL_SERVER_ERROR = 500,
  BAD_GATEWAY = 502,
  SERVICE_UNAVAILABLE = 503,
  GATEWAY_TIMEOUT = 504,
  HTTP_VERSION_NOT_SUPPORTED = 505,
  VARIANT_ALSO_NEGOTIATES = 506,
  INSUFFICIENT_STORAGE = 507,
  LOOP_DETECTED = 508,
  NOT_EXTENDED = 510,
  NETWORK_AUTHENTICATION_REQUIRED = 511,
}

// Error Types
export enum ErrorType {
  VALIDATION = 'ValidationError',
  AUTHENTICATION = 'AuthenticationError',
  AUTHORIZATION = 'AuthorizationError',
  NOT_FOUND = 'NotFoundError',
  CONFLICT = 'ConflictError',
  DATABASE = 'DatabaseError',
}

// Base Error Class
export class AppError extends Error {
  public readonly statusCode: HttpStatusCode;
  public readonly status: 'fail' | 'error';
  public readonly isOperational: boolean;
  public readonly type: ErrorType;

  constructor(
    message: string,
    statusCode: HttpStatusCode,
    type: ErrorType,
    isOperational: boolean = true
  ) {
    super(message);
    this.statusCode = statusCode;
    this.status = statusCode < 500 ? 'fail' : 'error';
    this.isOperational = isOperational;
    this.type = type;

    Error.captureStackTrace(this, this.constructor);
  }
}

// Validation Error Details
export class ValidationErrorDetail {
  field: string;
  message: string;

  constructor(field: string, message: string) {
    this.field = field;
    this.message = message;
  }
}

// Specific Error Classes
export class ValidationError extends AppError {
  public readonly details: ValidationErrorDetail[];

  constructor(message: string, details: ValidationErrorDetail[]) {
    super(message, HttpStatusCode.BAD_REQUEST, ErrorType.VALIDATION);
    this.name = ErrorType.VALIDATION;
    this.details = details;
  }
}

export class AuthenticationError extends AppError {
  constructor(message: string = 'Authentication failed') {
    super(message, HttpStatusCode.UNAUTHORIZED, ErrorType.AUTHENTICATION);
    this.name = ErrorType.AUTHENTICATION;
  }
}

export class AuthorizationError extends AppError {
  constructor(message: string = 'Not authorized to perform this action') {
    super(message, HttpStatusCode.FORBIDDEN, ErrorType.AUTHORIZATION);
    this.name = ErrorType.AUTHORIZATION;
  }
}

export class NotFoundError extends AppError {
  constructor(message: string = 'Resource not found') {
    super(message, HttpStatusCode.NOT_FOUND, ErrorType.NOT_FOUND);
    this.name = ErrorType.NOT_FOUND;
  }
}

export class ConflictError extends AppError {
  constructor(message: string = 'Resource already exists') {
    super(message, HttpStatusCode.CONFLICT, ErrorType.CONFLICT);
    this.name = ErrorType.CONFLICT;
  }
}

export class DatabaseError extends AppError {
  constructor(message: string = 'Database operation failed') {
    super(message, HttpStatusCode.INTERNAL_SERVER_ERROR, ErrorType.DATABASE, false);
    this.name = ErrorType.DATABASE;
  }
}
