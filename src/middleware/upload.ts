import { Request } from 'express';
import multer, { FileFilterCallback } from 'multer';
import { AppError, ErrorType, HttpStatusCode } from '../utils/error';

// Use memory storage to process file buffer before sending to Supabase
const storage = multer.memoryStorage();

const fileFilter = (_req: Request, file: Express.Multer.File, cb: FileFilterCallback): void => {
  // Allow only images
  if (file.mimetype.startsWith('image/')) {
    cb(null, true);
  } else {
    cb(
      new AppError(
        'Only image files are allowed!',
        HttpStatusCode.BAD_REQUEST,
        ErrorType.VALIDATION
      ) as unknown as Error
    );
  }
};

export const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
});
