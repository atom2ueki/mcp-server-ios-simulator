import logger from './logger';

let isShuttingDown = false;

/**
 * Handle graceful shutdown to prevent multiple shutdown attempts
 * @param signal The signal that triggered the shutdown
 * @param shutdownFn The function to call for shutdown logic
 */
export function shutdownGracefully(
  signal: string, 
  shutdownFn: (signal: string) => Promise<void>
): void {
  if (isShuttingDown) {
    logger.info(`Received another ${signal} signal during shutdown, ignoring`);
    return;
  }
  
  isShuttingDown = true;
  shutdownFn(signal).catch(error => {
    logger.error(`Error in shutdown handler: ${error}`);
    process.exit(1);
  });
} 