import dotenv from 'dotenv';
import path from 'path';

// Load environment variables from main .env file
dotenv.config({ path: path.join(__dirname, '.env') });

// Set test environment
process.env.NODE_ENV = 'test';

// Set test timeout
jest.setTimeout(30000);
