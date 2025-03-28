# Smart Expense Tracking API

This is the backend API for Smart Expense Tracking, a comprehensive expense management application.

## Technologies Used

- Node.js with Express
- TypeScript
- Firebase (Auth & Firestore)
- Jest for testing

## Project Structure

```
backend/
├── src/
│   ├── config/        # Configuration files
│   ├── controllers/   # Route controllers
│   ├── middleware/    # Express middleware
│   ├── models/        # Data models and DTOs
│   ├── routes/        # API routes
│   ├── services/      # Business logic
│   ├── utils/         # Utility functions
│   ├── validations/   # Request validation schemas
│   ├── app.ts         # Express app setup
│   └── server.ts      # Server entry point
├── __tests__/         # Test files
├── dist/              # Compiled JavaScript files
└── logs/              # Application logs
```

## Getting Started

### Prerequisites

- Node.js 16+ and npm
- Firebase project with Firestore and Authentication enabled

### Installation

1. Clone the repository
2. Install dependencies:
   ```
   npm install
   ```
3. Copy `.env.example` to `.env` and update the environment variables:
   ```
   cp .env.example .env
   ```

### Environment Variables

The following environment variables are required:

```
NODE_ENV=development
PORT=5000
FRONTEND_URL=http://localhost:3000
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:19006

# Firebase
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_PRIVATE_KEY=your-private-key
FIREBASE_CLIENT_EMAIL=your-client-email
FIREBASE_API_KEY=your-api-key

# Email (Gmail)
EMAIL_USER=your-email@gmail.com
EMAIL_APP_PASSWORD=your-app-password

# Twilio
TWILIO_ACCOUNT_SID=your-account-sid
TWILIO_AUTH_TOKEN=your-auth-token
TWILIO_VERIFY_SERVICE_ID=your-verify-service-id
TWILIO_PHONE_NUMBER=your-phone-number

# JWT
JWT_SECRET=your-secret-key
JWT_EXPIRES_IN=7d
```

### Running the Application

**Development mode:**

```
npm run dev
```

**Production build:**

```
npm run build
npm start
```

### API Endpoints

| Method | Endpoint               | Description          | Authentication |
| ------ | ---------------------- | -------------------- | -------------- |
| POST   | /api/auth/register     | Register a new user  | No             |
| POST   | /api/auth/login        | Log in a user        | No             |
| GET    | /api/auth/me           | Get logged-in user   | Yes            |
| GET    | /api/expenses          | Get all expenses     | Yes            |
| POST   | /api/expenses          | Create a new expense | Yes            |
| GET    | /api/expenses/:id      | Get expense by ID    | Yes            |
| PUT    | /api/expenses/:id      | Update expense       | Yes            |
| DELETE | /api/expenses/:id      | Delete expense       | Yes            |
| GET    | /api/analytics/summary | Get expense summary  | Yes            |
| GET    | /api/analytics/trends  | Get expense trends   | Yes            |

## Testing

Run tests:

```
npm test
```

Run tests with coverage:

```
npm run test:coverage
```

## Recent Optimizations

The following optimizations were implemented:

1. **Improved Error Handling**:

   - Added proper try/catch blocks in services
   - Enhanced error types and messaging
   - Better null/undefined checks

2. **Enhanced Security**:

   - Strengthened rate limiting
   - Added request timeout
   - Improved CORS configuration
   - Added Helmet security headers

3. **Performance Optimizations**:

   - Better Firebase connection handling
   - Optimized query patterns
   - Enhanced date handling

4. **Code Quality**:

   - Added JSDoc comments
   - Added tests
   - Fixed type inconsistencies
   - Improved code organization

5. **Reliability**:
   - Graceful server shutdown
   - Better connection tracking
   - Improved logging

## Deployment

### Production Setup

1. Build the application:

   ```
   npm run build
   ```

2. Set environment variables for production

3. Start the server:
   ```
   npm start
   ```

### Container Deployment (Docker)

1. Build the Docker image:

   ```
   docker build -t smart-expense-api .
   ```

2. Run the container:
   ```
   docker run -p 5000:5000 --env-file .env smart-expense-api
   ```

## License

This project is licensed under the MIT License - see the LICENSE file for details.
