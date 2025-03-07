import { getSimulator } from 'appium-ios-simulator';
import { v4 as uuidv4 } from 'uuid';
import winston from 'winston';
import fs from 'fs';
import path from 'path';
import config from '../config';
import { exec } from 'child_process';
import { promisify } from 'util';

// Create logs directory if it doesn't exist
const logsDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logsDir)) {
  try {
    fs.mkdirSync(logsDir, { recursive: true });
  } catch (err) {
    console.error(`Failed to create logs directory: ${err}`);
    // Don't fail if we can't create logs directory
  }
}

// Create a file-only logger (no console output to avoid corrupting stdio transport)
let fileLogger: winston.Logger;
try {
  fileLogger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.json()
    ),
    defaultMeta: { service: 'simulator-manager' },
    transports: [
      // Write to file only
      new winston.transports.File({ filename: path.join(logsDir, 'simulator.log') }),
      new winston.transports.File({ filename: path.join(logsDir, 'simulator-error.log'), level: 'error' })
    ]
  });
} catch (err) {
  // Fallback to a silent logger if file logging fails
  fileLogger = winston.createLogger({
    silent: true
  });
  console.error(`Failed to initialize file logger: ${err}`);
}

// Interface for simulator options
interface SimulatorOptions {
  deviceName?: string;
  platformVersion?: string;
  timeout?: number;
}

// Interface for the simulator object from appium-ios-simulator
// This represents the methods we use from the simulator instance
// The actual simulator object is a complex composition of multiple interfaces
interface Simulator {
  // Core methods
  stat(): Promise<{ state: string }>;
  run(): Promise<void>;
  shutdown(): Promise<void>;
  
  // App management
  installApp(appPath: string): Promise<void>;
  launchApp(bundleId: string): Promise<void>;
  terminateApp(bundleId: string): Promise<void>;
  
  // Utilities
  getScreenshot(): Promise<Buffer>;
  spawnProcess(command: string, args: string[]): Promise<void>;
}

// Interface for simulator session
interface SimulatorSession {
  id: string;
  simulator: Simulator;
  udid: string;
  deviceName: string;
  platformVersion: string;
  createdAt: Date;
  lastUsedAt: Date;
}

// Interface for booted simulator info
interface BootedSimulator {
  udid: string;
  name: string;
  state: string;
  runtime: string;
}

// Interface for simulator info
interface SimulatorInfo {
  udid: string;
  name: string;
  state: string;
  runtime: string;
  isAvailable: boolean;
}

class SimulatorManager {
  private sessions: Map<string, SimulatorSession>;

  constructor() {
    this.sessions = new Map();
    fileLogger.info('SimulatorManager initialized');
  }

  /**
   * Creates a new simulator session
   */
  async createSession(options: SimulatorOptions = {}): Promise<SimulatorSession> {
    try {
      // Use provided options or defaults from config
      const deviceName = options.deviceName || config.simulator.defaultDevice;
      const platformVersion = options.platformVersion || config.simulator.defaultOS;
      const timeout = options.timeout || config.simulator.timeout;

      fileLogger.info(`Creating simulator session with device: ${deviceName}, OS: ${platformVersion}`);

      // Get all available simulators
      const simulators = await this.getAllSimulators();
      
      // Log available matching simulators for debugging
      this.logMatchingSimulators(simulators, deviceName);
      
      // If UDID is provided directly, use it
      if (deviceName.match(/^[0-9A-F]{8}-([0-9A-F]{4}-){3}[0-9A-F]{12}$/i)) {
        const udidMatch = simulators.find(sim => sim.udid === deviceName);
        if (udidMatch && udidMatch.isAvailable) {
          fileLogger.info(`Found simulator with exact UDID match: ${udidMatch.name}`);
          return this.createSessionFromSimulator(udidMatch, timeout);
        }
      }
      
      // Find matching simulator using a tiered approach
      let matchingSimulator: SimulatorInfo | undefined;
      
      // Tier 1: Exact name match (most strict)
      matchingSimulator = this.findExactNameMatch(simulators, deviceName, platformVersion);
      
      // Tier 2: Word boundary matching (prevent "iPhone 14" from matching "iPhone 14 Pro")
      if (!matchingSimulator) {
        matchingSimulator = this.findWordBoundaryMatch(simulators, deviceName, platformVersion);
      }
      
      // Tier 3: Substring matching (most lenient, last resort)
      if (!matchingSimulator) {
        matchingSimulator = this.findSubstringMatch(simulators, deviceName, platformVersion);
      }

      if (!matchingSimulator) {
        throw new Error(`No matching simulator found for device: ${deviceName}, OS: ${platformVersion}`);
      }

      return this.createSessionFromSimulator(matchingSimulator, timeout);
    } catch (error) {
      fileLogger.error('Failed to create simulator session', { error });
      throw error;
    }
  }
  
  /**
   * Find simulator with exact name match
   */
  private findExactNameMatch(simulators: SimulatorInfo[], deviceName: string, platformVersion?: string): SimulatorInfo | undefined {
    return simulators.find(sim => {
      const exactNameMatch = sim.name.toLowerCase() === deviceName.toLowerCase();
      const versionMatch = !platformVersion || 
                          sim.runtime.includes(platformVersion) || 
                          sim.runtime.toLowerCase().includes(platformVersion.toLowerCase());
      return exactNameMatch && versionMatch && sim.isAvailable;
    });
  }
  
  /**
   * Find simulator using word boundary matching
   * This ensures "iPhone 14" doesn't match "iPhone 14 Pro"
   */
  private findWordBoundaryMatch(simulators: SimulatorInfo[], deviceName: string, platformVersion?: string): SimulatorInfo | undefined {
    // Clean and escape the device name for regex
    const normalizedDeviceName = deviceName.toLowerCase().replace(/\s+/g, ' ').trim();
    const escapedDeviceName = normalizedDeviceName.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
    const modelPattern = new RegExp(`\\b${escapedDeviceName}\\b`, 'i');
    
    return simulators.find(sim => {
      const simName = sim.name.toLowerCase();
      const modelMatch = modelPattern.test(simName);
      const versionMatch = !platformVersion || 
                          sim.runtime.includes(platformVersion) || 
                          sim.runtime.toLowerCase().includes(platformVersion.toLowerCase());
      
      return modelMatch && versionMatch && sim.isAvailable;
    });
  }
  
  /**
   * Find simulator using basic substring matching (last resort)
   */
  private findSubstringMatch(simulators: SimulatorInfo[], deviceName: string, platformVersion?: string): SimulatorInfo | undefined {
    return simulators.find(sim => {
      const nameMatch = sim.name.toLowerCase().includes(deviceName.toLowerCase());
      const versionMatch = !platformVersion || 
                          sim.runtime.includes(platformVersion) || 
                          sim.runtime.toLowerCase().includes(platformVersion.toLowerCase());
      
      return nameMatch && versionMatch && sim.isAvailable;
    });
  }
  
  /**
   * Logs available matching simulators for debugging
   */
  private logMatchingSimulators(simulators: SimulatorInfo[], devicePattern: string): void {
    const matchingSimulators = simulators.filter(sim => {
      return sim.name.toLowerCase().includes(devicePattern.toLowerCase());
    });

    if (matchingSimulators.length > 0) {
      fileLogger.info(`Available simulators matching "${devicePattern}":`);
      matchingSimulators.forEach(sim => {
        fileLogger.info(`${sim.name} - UDID: ${sim.udid} - Runtime: ${sim.runtime}`);
      });
    } else {
      fileLogger.info(`No simulators found matching "${devicePattern}"`);
    }
  }

  /**
   * Helper method to create a session from a simulator
   */
  private async createSessionFromSimulator(matchingSimulator: SimulatorInfo, timeout: number): Promise<SimulatorSession> {
    const udid = matchingSimulator.udid;
    fileLogger.info(`Creating session for simulator with UDID: ${udid}, Name: ${matchingSimulator.name}`);
    
    try {
      // Get the simulator instance from appium-ios-simulator
      const simulator = await getSimulator(udid);
      
      // Create a new session
      const session: SimulatorSession = {
        id: uuidv4(),
        simulator: simulator as unknown as Simulator, // Use type assertion to make TypeScript happy
        udid,
        deviceName: matchingSimulator.name,
        platformVersion: matchingSimulator.runtime,
        createdAt: new Date(),
        lastUsedAt: new Date()
      };
      
      // Add the session to the sessions map
      this.sessions.set(session.id, session);
      
      fileLogger.info(`Session created with ID: ${session.id}`);
      return session;
    } catch (error) {
      fileLogger.error(`Failed to create session for simulator ${udid}: ${error}`);
      throw error;
    }
  }

  /**
   * Gets an existing simulator session by ID
   */
  getSession(sessionId: string): SimulatorSession | undefined {
    const session = this.sessions.get(sessionId);
    if (session) {
      // Update last used timestamp
      session.lastUsedAt = new Date();
    }
    return session;
  }

  /**
   * Gets all simulator sessions
   */
  getAllSessions(): SimulatorSession[] {
    return Array.from(this.sessions.values());
  }

  /**
   * Terminates and removes a simulator session
   * Note: This does more than just shutting down - it also cleans up the session record.
   * Use this when you want to completely remove a session, not just shut down the simulator.
   */
  async terminateSession(sessionId: string): Promise<boolean> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      fileLogger.warn(`Session not found: ${sessionId}`);
      return false;
    }

    try {
      // Try to get the simulator status
      let isRunning = false;
      try {
        const status = await session.simulator.stat();
        isRunning = status.state === 'Booted';
      } catch (statError) {
        // If we can't get status, check the booted simulators list
        fileLogger.warn(`Failed to get simulator status, checking booted simulators`, { statError });
        const bootedSimulators = await this.getBootedSimulators();
        isRunning = bootedSimulators.some(sim => sim.udid === session.udid);
      }
      
      // Shutdown the simulator if running
      if (isRunning) {
        fileLogger.info(`Shutting down simulator for session: ${sessionId}`);
        await this.shutdownSimulator(sessionId);
      } else {
        fileLogger.info(`Simulator already shut down for session: ${sessionId}`);
      }
      
      // Remove from sessions map
      this.sessions.delete(sessionId);
      
      fileLogger.info(`Session terminated: ${sessionId}`);
      return true;
    } catch (error) {
      fileLogger.error(`Failed to terminate session: ${sessionId}`, { error });
      return false;
    }
  }

  /**
   * Boots a simulator for a given session
   */
  async bootSimulator(sessionId: string): Promise<boolean> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      fileLogger.warn(`Session not found: ${sessionId}`);
      return false;
    }

    try {
      await session.simulator.run();
      fileLogger.info(`Simulator booted for session: ${sessionId}`);
      return true;
    } catch (error) {
      fileLogger.error(`Failed to boot simulator for session: ${sessionId}`, { error });
      return false;
    }
  }

  /**
   * Shuts down a simulator for a given session
   */
  async shutdownSimulator(sessionId: string): Promise<boolean> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      fileLogger.warn(`Session not found: ${sessionId}`);
      return false;
    }

    try {
      // Try the simulator object method first
      fileLogger.info(`Attempting to shut down simulator (via API) for session: ${sessionId}, UDID: ${session.udid}`);
      
      try {
        await session.simulator.shutdown();
        fileLogger.info(`Simulator API shutdown successful for session: ${sessionId}`);
      } catch (innerError) {
        fileLogger.warn(`API shutdown failed, falling back to CLI for session: ${sessionId}`, { innerError });
        // If the simulator object method fails, try direct CLI
        await this.directShutdownByUDID(session.udid);
      }
      
      // Verify the shutdown was successful
      let verifySuccess = await this.verifySimulatorShutdown(session.udid);
      
      // If not, try the CLI approach as a fallback
      if (!verifySuccess) {
        fileLogger.warn(`Simulator still running, trying direct CLI shutdown for session: ${sessionId}`);
        await this.directShutdownByUDID(session.udid);
        verifySuccess = await this.verifySimulatorShutdown(session.udid);
      }
      
      if (verifySuccess) {
        fileLogger.info(`Simulator successfully shutdown for session: ${sessionId}`);
        return true;
      } else {
        fileLogger.warn(`Simulator may still be running for session: ${sessionId}`);
        return false;
      }
    } catch (error) {
      fileLogger.error(`Failed to shutdown simulator for session: ${sessionId}`, { error });
      return false;
    }
  }
  
  /**
   * Directly shut down a simulator by UDID using simctl CLI
   */
  async directShutdownByUDID(udid: string): Promise<boolean> {
    fileLogger.info(`Attempting direct CLI shutdown for simulator: ${udid}`);
    try {
      const execAsync = promisify(exec);
      await execAsync(`xcrun simctl shutdown ${udid}`);
      fileLogger.info(`Direct CLI shutdown command completed for simulator: ${udid}`);
      return true;
    } catch (error) {
      fileLogger.error(`Failed direct CLI shutdown for simulator: ${udid}`, { error });
      return false;
    }
  }
  
  /**
   * Verify a simulator is truly shut down
   */
  async verifySimulatorShutdown(udid: string): Promise<boolean> {
    try {
      // Get all booted simulators
      const bootedSimulators = await this.getBootedSimulators();
      
      // Check if our UDID is still in the list of booted simulators
      const stillRunning = bootedSimulators.some(sim => sim.udid === udid);
      
      if (stillRunning) {
        fileLogger.warn(`Simulator ${udid} is still reported as running`);
        return false;
      } else {
        fileLogger.info(`Verified simulator ${udid} is shut down`);
        return true;
      }
    } catch (error) {
      fileLogger.error(`Failed to verify simulator shutdown status: ${udid}`, { error });
      return false;
    }
  }

  /**
   * Installs an app on the simulator
   */
  async installApp(sessionId: string, appPath: string): Promise<boolean> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      fileLogger.warn(`Session not found: ${sessionId}`);
      return false;
    }

    try {
      await session.simulator.installApp(appPath);
      fileLogger.info(`App installed on simulator for session: ${sessionId}`);
      return true;
    } catch (error) {
      fileLogger.error(`Failed to install app for session: ${sessionId}`, { error });
      return false;
    }
  }

  /**
   * Launches an app on the simulator
   */
  async launchApp(sessionId: string, bundleId: string): Promise<boolean> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      fileLogger.warn(`Session not found: ${sessionId}`);
      return false;
    }

    try {
      await session.simulator.launchApp(bundleId);
      fileLogger.info(`App launched on simulator for session: ${sessionId}`);
      return true;
    } catch (error) {
      fileLogger.error(`Failed to launch app for session: ${sessionId}`, { error });
      return false;
    }
  }

  /**
   * Terminates an app on the simulator
   */
  async terminateApp(sessionId: string, bundleId: string): Promise<boolean> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      fileLogger.warn(`Session not found: ${sessionId}`);
      return false;
    }

    try {
      await session.simulator.terminateApp(bundleId);
      fileLogger.info(`App terminated on simulator for session: ${sessionId}`);
      return true;
    } catch (error) {
      fileLogger.error(`Failed to terminate app for session: ${sessionId}`, { error });
      return false;
    }
  }

  /**
   * Gets a screenshot from the simulator
   */
  async getScreenshot(sessionId: string): Promise<Buffer | null> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      fileLogger.warn(`Session not found: ${sessionId}`);
      return null;
    }

    try {
      const screenshot = await session.simulator.getScreenshot();
      fileLogger.info(`Screenshot captured for session: ${sessionId}`);
      return screenshot;
    } catch (error) {
      fileLogger.error(`Failed to capture screenshot for session: ${sessionId}`, { error });
      return null;
    }
  }

  /**
   * Performs a tap action on the simulator at specified coordinates
   */
  async performTap(sessionId: string, x: number, y: number): Promise<boolean> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      fileLogger.warn(`Session not found: ${sessionId}`);
      return false;
    }

    try {
      // Note: This is a simplified implementation
      // In a real-world scenario, you'd use more advanced methods from Appium
      await session.simulator.spawnProcess('xcrun', ['simctl', 'io', session.udid, 'input', 'tap', x.toString(), y.toString()]);
      fileLogger.info(`Tap performed at (${x}, ${y}) for session: ${sessionId}`);
      return true;
    } catch (error) {
      fileLogger.error(`Failed to perform tap for session: ${sessionId}`, { error });
      return false;
    }
  }

  /**
   * Gets a list of all simulators on the system using exec
   * This avoids node-simctl which might be writing to stdout and corrupting MCP messages
   */
  async getAllSimulators(): Promise<SimulatorInfo[]> {
    try {
      const execAsync = promisify(exec);
      // Use simctl directly to avoid potential stdout corruption
      const { stdout } = await execAsync('xcrun simctl list devices -j');
      
      // Safely parse the JSON output
      const devices = JSON.parse(stdout).devices;
      const allSimulators: SimulatorInfo[] = [];
      
      // Parse the output to find all devices
      for (const runtime in devices) {
        const runtimeDevices = devices[runtime];
        for (const device of runtimeDevices) {
          allSimulators.push({
            udid: device.udid,
            name: device.name,
            state: device.state,
            runtime: runtime,
            isAvailable: device.isAvailable !== false
          });
        }
      }
      
      fileLogger.info(`Found ${allSimulators.length} simulators`);
      return allSimulators;
    } catch (error) {
      fileLogger.error('Failed to get simulators', { error });
      return [];
    }
  }

  /**
   * Gets a list of all booted simulators on the system
   */
  async getBootedSimulators(): Promise<BootedSimulator[]> {
    try {
      // Using getAllSimulators and filter for better consistency
      const allSimulators = await this.getAllSimulators();
      const bootedSimulators = allSimulators
        .filter(sim => sim.state === 'Booted')
        .map(sim => ({
          udid: sim.udid,
          name: sim.name,
          state: sim.state,
          runtime: sim.runtime
        }));
      
      fileLogger.info(`Found ${bootedSimulators.length} booted simulators`);
      return bootedSimulators;
    } catch (error) {
      fileLogger.error('Failed to get booted simulators', { error });
      return [];
    }
  }

  /**
   * Boot a simulator by UDID without creating a session
   * @param udid The UDID of the simulator to boot
   * @returns True if the simulator was booted successfully, false otherwise
   */
  async bootByUDID(udid: string): Promise<boolean> {
    fileLogger.info(`Booting simulator with UDID: ${udid}`);
    
    try {
      // First check if a simulator with this UDID exists
      const allSimulators = await this.getAllSimulators();
      const simulator = allSimulators.find(sim => sim.udid === udid);
      
      if (!simulator) {
        fileLogger.error(`No simulator found with UDID: ${udid}`);
        return false;
      }
      
      // Check if the simulator is already booted
      const bootedSimulators = await this.getBootedSimulators();
      const isAlreadyBooted = bootedSimulators.some(sim => sim.udid === udid);
      
      if (isAlreadyBooted) {
        fileLogger.info(`Simulator with UDID ${udid} is already booted`);
        return true;
      }
      
      // Get a simulator instance from appium-ios-simulator
      const simulatorInstance = await getSimulator(udid);
      
      // Boot the simulator
      fileLogger.info(`Running simulator with UDID: ${udid}`);
      await simulatorInstance.run();
      
      // Verify the simulator has booted
      await new Promise(resolve => setTimeout(resolve, 2000)); // Wait for simulator to register as booted
      const newBootedSimulators = await this.getBootedSimulators();
      const didBoot = newBootedSimulators.some(sim => sim.udid === udid);
      
      if (didBoot) {
        fileLogger.info(`Successfully booted simulator with UDID: ${udid}`);
        return true;
      } else {
        fileLogger.error(`Simulator with UDID ${udid} did not register as booted after run() command`);
        return false;
      }
    } catch (error) {
      fileLogger.error(`Failed to boot simulator with UDID: ${udid}`, { error });
      return false;
    }
  }
}

export default new SimulatorManager(); 