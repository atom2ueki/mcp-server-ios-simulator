import winston from 'winston';
import config from '../config';
import fs from 'fs';
import path from 'path';

// Create logs directory if it doesn't exist
const logsDir = path.join(process.cwd(), 'logs');
try {
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
  }
} catch (err) {
  console.error(`Failed to create logs directory: ${err}`);
  // Don't fail if we can't create logs directory
}

// Create file transports with error handling
interface FileTransportOptions {
  filename: string;
  level?: string;
}

const createFileTransport = (options: FileTransportOptions) => {
  try {
    return new winston.transports.File({
      ...options,
      filename: path.join(logsDir, options.filename)
    });
  } catch (err) {
    console.error(`Failed to create file transport: ${err}`);
    return null;
  }
};

// Prepare transports array
const transports: winston.transport[] = [];

// Add file transports if possible
const combinedTransport = createFileTransport({ filename: 'combined.log' });
if (combinedTransport) transports.push(combinedTransport);

const errorTransport = createFileTransport({ filename: 'error.log', level: 'error' });
if (errorTransport) transports.push(errorTransport);

// Create a logger instance - NO CONSOLE OUTPUT to avoid corrupting stdio
const logger = winston.createLogger({
  level: config.mcp.logLevel || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  defaultMeta: { service: 'mcp-ios-simulator' },
  transports
});

export default logger; 