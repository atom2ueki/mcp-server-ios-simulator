#!/usr/bin/env node

// IMMEDIATELY disable all console output to avoid interfering with stdio transport
// This must come before any other imports to ensure nothing writes to stdout
console.log = () => {}; 
console.info = () => {};
console.warn = () => {};
console.error = (msg) => {
  // Only log errors to stderr, not stdout
  process.stderr.write(`${msg}\n`);
};
console.debug = () => {};

import mcpServer from './mcp/mcp-server';
import logger from './utils/logger';
import fs from 'fs';
import path from 'path';

/**
 * Main entry point for the iOS Simulator MCP Server
 * 
 * This starts the stdio-based MCP server to handle iOS simulator commands
 * from LLM assistants through Model Context Protocol.
 * 
 * For use with Claude Desktop:
 * 1. Build with: npm run build
 * 2. In Claude Desktop settings, add CLI Tool with command:
 *    node /path/to/dist/index.js
 */

// Create logs directory with error handling
try {
  const logsDir = path.join(process.cwd(), 'logs');
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
  }
} catch (err) {
  // Can't use logger here as it might not be initialized
  process.stderr.write(`Failed to create logs directory: ${err}\n`);
}

async function start() {
  try {
    // Starting MCP server (log to file only)
    await mcpServer.start();
  } catch (error) {
    process.stderr.write(`Failed to start MCP server: ${error}\n`);
    process.exit(1);
  }
}

// Handle signals - do this very quietly
process.on('SIGINT', () => {
  process.exit(0);
});

process.on('SIGTERM', () => {
  process.exit(0);
});

// Handle uncaught exceptions and unhandled rejections
process.on('uncaughtException', (error) => {
  process.stderr.write(`Uncaught exception: ${error.stack}\n`);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  process.stderr.write(`Unhandled rejection: ${reason}\n`);
  process.exit(1);
});

// Start the server
start(); 