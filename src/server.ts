import { Socket } from 'net';
import app from './app';
import { env } from './config/env.config';
import { supabase } from './config/supabase';
import { logger } from './utils/logger';

// Keep track of connections to close during shutdown
const connections = new Set<Socket>();

// Track the server instance
const server = app.listen(env.PORT, async () => {
  logger.info(`Server is running on port ${env.PORT}`);
  logger.info(`Environment: ${env.NODE_ENV}`);
  logger.info(`Server URL: http://localhost:${env.PORT}`);

  try {
    // Verify Supabase connection by making a simple query
    const { error } = await supabase
      .from('profiles')
      .select('count', { count: 'exact', head: true });
    if (error) {
      logger.error('Supabase connection failed:', error.message);
    } else {
      logger.info('Supabase Connected Successfully');
    }
  } catch (err: any) {
    logger.error('Supabase connection error:', err.message);
  }
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
