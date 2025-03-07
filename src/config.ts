import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

// Load environment variables from .env file
dotenv.config();

// Default configuration
const defaultConfig = {
  simulator: {
    defaultDevice: 'iPhone 14',
    defaultOS: '16.4',
    timeout: 30000
  },
  mcp: {
    port: 8080,
    logLevel: 'info'
  },
  server: {
    host: 'localhost',
    port: 3001
  }
};

// Load config from file if it exists
let fileConfig = {};
const configPath = path.join(process.cwd(), 'config.json');
if (fs.existsSync(configPath)) {
  try {
    const configFile = fs.readFileSync(configPath, 'utf8');
    fileConfig = JSON.parse(configFile);
  } catch (error) {
    console.error(`Error loading config file: ${error}`);
  }
}

// Environment variable configuration (overrides file and default)
const envConfig = {
  simulator: {
    defaultDevice: process.env.SIMULATOR_DEFAULT_DEVICE,
    defaultOS: process.env.SIMULATOR_DEFAULT_OS,
    timeout: process.env.SIMULATOR_TIMEOUT ? parseInt(process.env.SIMULATOR_TIMEOUT, 10) : undefined
  },
  mcp: {
    port: process.env.MCP_PORT ? parseInt(process.env.MCP_PORT, 10) : undefined,
    logLevel: process.env.MCP_LOG_LEVEL
  },
  server: {
    host: process.env.SERVER_HOST,
    port: process.env.SERVER_PORT ? parseInt(process.env.SERVER_PORT, 10) : undefined
  }
};

// Clean undefined values from env config
const cleanConfig = (obj: Record<string, any>): Record<string, any> => {
  const cleaned: Record<string, any> = {};
  for (const key in obj) {
    if (typeof obj[key] === 'object' && obj[key] !== null) {
      const nestedCleaned = cleanConfig(obj[key]);
      if (Object.keys(nestedCleaned).length > 0) {
        cleaned[key] = nestedCleaned;
      }
    } else if (obj[key] !== undefined) {
      cleaned[key] = obj[key];
    }
  }
  return cleaned;
};

const cleanedEnvConfig = cleanConfig(envConfig);

// Merge configurations with appropriate precedence
// env vars > config file > defaults
const config = {
  ...defaultConfig,
  ...fileConfig,
  ...cleanedEnvConfig
};

export default config; 