import app from './app';
import { env } from './config/env.config';
import { logger } from './utils/logger';

// Keep track of connections to close during shutdown
const connections = new Set<any>();

// Track the server instance
const server = app.listen(env.PORT, () => {
  logger.info(`Server is running on port ${env.PORT}`);
  logger.info(`Environment: ${env.NODE_ENV}`);
  logger.info(`Server URL: http://localhost:${env.PORT}`);
});

// Track connections for graceful shutdown
server.on('connection', (connection) => {
  connections.add(connection);
  connection.on('close', () => {
    connections.delete(connection);
  });
});

/**
 * Gracefully shut down the server
 * @param signal Signal received (e.g., SIGTERM, SIGINT)
 */
const gracefulShutdown = async (signal: string) => {
  logger.info(`${signal} received. Shutting down gracefully...`);

  // Close server to stop accepting new connections
  server.close(() => {
    logger.info('HTTP server closed');
  });

  // Close all existing connections
  for (const connection of connections) {
    connection.destroy();
  }

  try {
    // Perform any necessary cleanup (DB connections, etc.)
    logger.info('Cleaning up resources...');
    // Nothing to clean up for Firebase as it handles its own connections

    logger.info('Shutdown completed successfully');
    process.exit(0);
  } catch (error) {
    logger.error('Error during shutdown:', error);
    process.exit(1);
  }
};

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  gracefulShutdown('UNCAUGHT_EXCEPTION');
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (error) => {
  logger.error('Unhandled Rejection:', error);
  gracefulShutdown('UNHANDLED_REJECTION');
});

// Handle SIGTERM signal
process.on('SIGTERM', () => {
  gracefulShutdown('SIGTERM');
});

// Handle SIGINT signal
process.on('SIGINT', () => {
  gracefulShutdown('SIGINT');
});

// Export server for testing
export default server;
