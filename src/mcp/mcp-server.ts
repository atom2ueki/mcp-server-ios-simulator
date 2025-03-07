import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import winston from 'winston';
import fs from 'fs';
import path from 'path';
import simulatorManager from '../simulator/simulator-manager';

// Create a silent logger as default fallback
let fileLogger: winston.Logger = winston.createLogger({ silent: true });

// Try to create a file logger with proper error handling
try {
  // Create logs directory if it doesn't exist
  const logsDir = path.join(process.cwd(), 'logs');
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
  }

  // Create a file-only logger (no console output to avoid corrupting stdio transport)
  fileLogger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.json()
    ),
    defaultMeta: { service: 'mcp-server' },
    transports: [
      // Write to file only
      new winston.transports.File({ filename: path.join(logsDir, 'mcp.log') }),
      new winston.transports.File({ filename: path.join(logsDir, 'error.log'), level: 'error' })
    ]
  });
} catch (err) {
  // Nothing to do here - we'll just use the silent logger
  // We can't log errors since we're avoiding console output
}

/**
 * A simple MCP server implementation using stdio transport
 */
class SimulatorMcpServer {
  private server: McpServer;

  constructor() {
    // Create MCP server
    this.server = new McpServer({
      name: 'iOS Simulator MCP Server',
      version: '0.1.0'
    });
    
    // Configure server capabilities
    this.registerCapabilities();
    
    fileLogger.info('StdioMcpServer initialized');
  }

  /**
   * Register MCP resources and tools
   */
  private registerCapabilities(): void {
    // Register simulator session management tools
    this.registerSessionManagement();
    
    // Register app management tools
    this.registerAppManagement();
    
    // Register interaction tools
    this.registerInteractionTools();
    
    // Register simulator control tools
    this.registerSimulatorControl();
    
    // Register prompts
    this.registerPrompts();
  }

  /**
   * Register session management tools and resources
   */
  private registerSessionManagement(): void {
    // List all simulator sessions
    this.server.resource(
      'simulator-sessions-list',
      'simulator://sessions',
      async (uri) => {
        fileLogger.info(`Reading simulator sessions list resource: ${uri.href}`);
        const sessions = simulatorManager.getAllSessions();
        
        return {
          contents: [{
            uri: uri.href,
            text: JSON.stringify(sessions)
          }]
        };
      }
    );

    // Create simulator session
    this.server.tool(
      'create-simulator-session',
      {
        deviceName: z.string().optional(),
        platformVersion: z.string().optional(),
        timeout: z.number().optional(),
        autoboot: z.boolean().optional()
      },
      async (params) => {
        fileLogger.info('Creating simulator session', params);
        
        // Adding a warning before even trying to create a session
        fileLogger.info('Warning user about session-based approach');
        const warningText = "\n⚠️ WARNING: You're using the complex session-based approach ⚠️\n" +
                           "For most users, we recommend the simpler direct UDID approach instead:\n\n" +
                           "1. First run: list-available-simulators\n" +
                           "2. Then use: boot-simulator-by-udid with the UDID from the list\n\n" +
                           "Proceeding with session creation anyway...\n";
        
        try {
          // Get available simulators to provide helpful error messages if needed
          const availableSimulators = await simulatorManager.getAllSimulators();
          
          const session = await simulatorManager.createSession({
            deviceName: params.deviceName,
            platformVersion: params.platformVersion,
            timeout: params.timeout
          });
          
          // Automatically boot the simulator if requested (default to true)
          const shouldBoot = params.autoboot !== false;
          let bootResult = null;
          
          if (shouldBoot) {
            fileLogger.info(`Auto-booting simulator session: ${session.id}`);
            bootResult = await simulatorManager.bootSimulator(session.id);
            
            if (!bootResult) {
              fileLogger.warn(`Failed to auto-boot simulator session: ${session.id}`);
            } else {
              fileLogger.info(`Successfully auto-booted simulator session: ${session.id}`);
            }
          }
          
          return {
            content: [{
              type: 'text',
              text: warningText + JSON.stringify({
                ...session,
                booted: shouldBoot ? bootResult : false
              })
            }]
          };
        } catch (error) {
          fileLogger.error('Failed to create simulator session', { error });
          
          // Get available simulators to provide helpful error messages
          let helpText = "";
          try {
            const availableSimulators = await simulatorManager.getAllSimulators();
            
            // Group by iOS version for better readability
            const devicesByVersion: Record<string, string[]> = {};
            
            availableSimulators.forEach(simulator => {
              const version = simulator.runtime.replace('com.apple.CoreSimulator.SimRuntime.iOS-', '').replace(/\./g, '-');
              if (!devicesByVersion[version]) {
                devicesByVersion[version] = [];
              }
              devicesByVersion[version].push(simulator.name);
            });
            
            // Generate helpful message with available devices
            helpText = "\n\n⚠️ ERROR, BUT DON'T WORRY! There's a much easier way: ⚠️\n\n";
            helpText += "Instead of using sessions, try the direct UDID approach:\n";
            helpText += "1. Run 'list-available-simulators' to see all available simulators\n";
            helpText += "2. Choose one from the list and boot it directly with its UDID\n\n";
            
            helpText += "Available simulators you can use:\n";
            for (const [version, devices] of Object.entries(devicesByVersion)) {
              const formattedVersion = version.replace(/-/g, '.');
              helpText += `\n📱 iOS ${formattedVersion}:\n`;
              helpText += devices.sort().map((d: string) => `  - ${d}`).join('\n');
              helpText += '\n';
            }
            
            // Try to suggest a specific device if possible
            if (params.deviceName) {
              const matchSimulators = availableSimulators.filter(sim => 
                sim.name.toLowerCase().includes(params.deviceName?.toLowerCase() || "")
              );
              
              if (matchSimulators.length > 0) {
                const suggestedSim = matchSimulators[0];
                helpText += "\n💡 Try this instead:\n";
                helpText += `Run: list-available-simulators\n`;
                helpText += `Then: boot-simulator-by-udid with udid='${suggestedSim.udid}'\n`;
              }
            }
            
          } catch (helpError) {
            helpText = "\nCould not retrieve list of available simulators.";
          }
          
          return {
            content: [{
              type: 'text',
              text: `${helpText}\n\nOriginal error: ${error instanceof Error ? error.message : String(error)}`
            }],
            isError: true
          };
        }
      }
    );
    
    // Terminate simulator session
    this.server.tool(
      'terminate-simulator-session',
      {
        sessionId: z.string()
      },
      async ({ sessionId }) => {
        fileLogger.info(`Terminating simulator session: ${sessionId}`);
        try {
          const success = await simulatorManager.terminateSession(sessionId);
          
          if (!success) {
            return {
              content: [{
                type: 'text',
                text: `Failed to terminate session: ${sessionId}`
              }],
              isError: true
            };
          }
          
          return {
            content: [{
              type: 'text',
              text: `Session terminated: ${sessionId}`
            }]
          };
        } catch (error) {
          fileLogger.error(`Failed to terminate simulator session: ${sessionId}`, { error });
          return {
            content: [{
              type: 'text',
              text: `Error: ${error instanceof Error ? error.message : String(error)}`
            }],
            isError: true
          };
        }
      }
    );
    
    // Get simulator session info
    this.server.resource(
      'simulator-session',
      new ResourceTemplate('simulator://sessions/{sessionId}', { list: undefined }) as any,
      async (uri: { href: string }, params: any) => {
        const sessionId = params.sessionId;
        fileLogger.info(`Reading simulator session resource: ${uri.href}`);
        const session = simulatorManager.getSession(sessionId);
        
        if (!session) {
          return {
            contents: [{
              uri: uri.href,
              text: JSON.stringify({ error: `Session not found: ${sessionId}` })
            }]
          };
        }
        
        return {
          contents: [{
            uri: uri.href,
            text: JSON.stringify(session)
          }]
        };
      }
    );
  }
  
  /**
   * Register app management tools
   */
  private registerAppManagement(): void {
    // Install app
    this.server.tool(
      'install-app',
      {
        sessionId: z.string(),
        appPath: z.string()
      },
      async ({ sessionId, appPath }) => {
        fileLogger.info(`Installing app on simulator: ${sessionId}`, { appPath });
        try {
          const success = await simulatorManager.installApp(sessionId, appPath);
          
          if (!success) {
            return {
              content: [{
                type: 'text',
                text: `Failed to install app on session: ${sessionId}`
              }],
              isError: true
            };
          }
          
          return {
            content: [{
              type: 'text',
              text: `App installed on session: ${sessionId}`
            }]
          };
        } catch (error) {
          fileLogger.error(`Failed to install app on session: ${sessionId}`, { error });
          return {
            content: [{
              type: 'text',
              text: `Error: ${error instanceof Error ? error.message : String(error)}`
            }],
            isError: true
          };
        }
      }
    );
    
    // Launch app
    this.server.tool(
      'launch-app',
      {
        sessionId: z.string(),
        bundleId: z.string()
      },
      async ({ sessionId, bundleId }) => {
        fileLogger.info(`Launching app on simulator: ${sessionId}`, { bundleId });
        try {
          const success = await simulatorManager.launchApp(sessionId, bundleId);
          
          if (!success) {
            return {
              content: [{
                type: 'text',
                text: `Failed to launch app on session: ${sessionId}`
              }],
              isError: true
            };
          }
          
          return {
            content: [{
              type: 'text',
              text: `App launched on session: ${sessionId}`
            }]
          };
        } catch (error) {
          fileLogger.error(`Failed to launch app on session: ${sessionId}`, { error });
          return {
            content: [{
              type: 'text',
              text: `Error: ${error instanceof Error ? error.message : String(error)}`
            }],
            isError: true
          };
        }
      }
    );
    
    // Terminate app
    this.server.tool(
      'terminate-app',
      {
        sessionId: z.string(),
        bundleId: z.string()
      },
      async ({ sessionId, bundleId }) => {
        fileLogger.info(`Terminating app on simulator: ${sessionId}`, { bundleId });
        try {
          const success = await simulatorManager.terminateApp(sessionId, bundleId);
          
          if (!success) {
            return {
              content: [{
                type: 'text',
                text: `Failed to terminate app on session: ${sessionId}`
              }],
              isError: true
            };
          }
          
          return {
            content: [{
              type: 'text',
              text: `App terminated on session: ${sessionId}`
            }]
          };
        } catch (error) {
          fileLogger.error(`Failed to terminate app on session: ${sessionId}`, { error });
          return {
            content: [{
              type: 'text',
              text: `Error: ${error instanceof Error ? error.message : String(error)}`
            }],
            isError: true
          };
        }
      }
    );
  }
  
  /**
   * Register interaction tools
   */
  private registerInteractionTools(): void {
    // Tap interaction
    this.server.tool(
      'tap',
      {
        sessionId: z.string(),
        x: z.number(),
        y: z.number()
      },
      async ({ sessionId, x, y }) => {
        fileLogger.info(`Performing tap on simulator: ${sessionId}`, { x, y });
        try {
          const success = await simulatorManager.performTap(sessionId, x, y);
          
          if (!success) {
            return {
              content: [{
                type: 'text',
                text: `Failed to perform tap on session: ${sessionId}`
              }],
              isError: true
            };
          }
          
          return {
            content: [{
              type: 'text',
              text: `Tap performed at (${x}, ${y}) on session: ${sessionId}`
            }]
          };
        } catch (error) {
          fileLogger.error(`Failed to perform tap on session: ${sessionId}`, { error });
          return {
            content: [{
              type: 'text',
              text: `Error: ${error instanceof Error ? error.message : String(error)}`
            }],
            isError: true
          };
        }
      }
    );
    
    // Get screenshot
    this.server.resource(
      'simulator-screenshot',
      new ResourceTemplate('simulator://sessions/{sessionId}/screenshot', { list: undefined }) as any,
      async (uri: { href: string }, params: any) => {
        const sessionId = params.sessionId;
        fileLogger.info(`Getting screenshot from simulator: ${sessionId}`);
        try {
          const screenshot = await simulatorManager.getScreenshot(sessionId);
          
          if (!screenshot) {
            return {
              contents: [{
                uri: uri.href,
                text: JSON.stringify({ error: `Failed to get screenshot for session: ${sessionId}` })
              }]
            };
          }
          
          // Convert Buffer to base64 string
          return {
            contents: [{
              uri: uri.href,
              text: JSON.stringify({
                format: 'png',
                data: screenshot.toString('base64')
              })
            }]
          };
        } catch (error) {
          fileLogger.error(`Failed to get screenshot from session: ${sessionId}`, { error });
          return {
            contents: [{
              uri: uri.href,
              text: JSON.stringify({ error: `Error: ${error instanceof Error ? error.message : String(error)}` })
            }]
          };
        }
      }
    );
  }
  
  /**
   * Register simulator control tools
   */
  private registerSimulatorControl(): void {
    // ====================================================
    // DIRECT SIMULATOR CONTROL (RECOMMENDED)
    // ====================================================
    // These methods work directly with simulator UDIDs.
    // They are simpler and more straightforward for most use cases.
    // Use these unless you specifically need session management.
    
    // List all available simulators with UDIDs
    this.server.tool(
      'list-available-simulators',
      {},
      async () => {
        fileLogger.info('Listing all available simulators');
        try {
          const availableSimulators = await simulatorManager.getAllSimulators();
          
          // Group by iOS version for better readability
          const devicesByVersion: Record<string, string[]> = {};
          const udidMap: Record<string, string> = {};
          
          availableSimulators.forEach(simulator => {
            const version = simulator.runtime.replace('com.apple.CoreSimulator.SimRuntime.iOS-', '').replace(/\./g, '-');
            if (!devicesByVersion[version]) {
              devicesByVersion[version] = [];
            }
            devicesByVersion[version].push(simulator.name);
            udidMap[`${simulator.name}-${version}`] = simulator.udid;
          });
          
          // Generate table format with UDIDs
          let tableText = "⭐️ AVAILABLE SIMULATORS - USE THESE UDIDs TO BOOT DIRECTLY ⭐️\n";
          tableText += "─────────────────────────────────────────────────────\n";
          tableText += "NAME                 | iOS VERSION | STATE    | UDID\n";
          tableText += "─────────────────────────────────────────────────────\n";
          
          for (const [version, devices] of Object.entries(devicesByVersion)) {
            const formattedVersion = version.replace(/-/g, '.');
            devices.sort().forEach((deviceName: string) => {
              const simulator = availableSimulators.find(s => s.name === deviceName && s.runtime.includes(version.replace(/-/g, '.')));
              const state = simulator ? simulator.state : 'Unknown';
              const udid = simulator ? simulator.udid : 'Unknown';
              tableText += `${deviceName.padEnd(20)} | iOS ${formattedVersion.padEnd(9)} | ${state.padEnd(8)} | ${udid}\n`;
            });
          }
          tableText += "─────────────────────────────────────────────────────\n";
          
          tableText += "\n💡 RECOMMENDED WORKFLOW:\n";
          tableText += "1️⃣ FIRST: Find the simulator you want from the list above\n";
          tableText += "2️⃣ THEN: Use 'boot-simulator-by-udid' with udid='COPY_UDID_FROM_ABOVE'\n";
          tableText += "3️⃣ FINALLY: When done, use 'shutdown-simulator-by-udid' with the same UDID\n\n";
          tableText += "❌ AVOID using session-based methods like 'create-simulator-session' unless you specifically need advanced features\n";
          
          // For debugging, append the original JSON at the bottom
          tableText += "\nOriginal JSON data:\n```\n";
          tableText += JSON.stringify(availableSimulators, null, 2);
          tableText += "\n```";
          
          return {
            content: [{
              type: 'text',
              text: tableText
            }]
          };
        } catch (error) {
          fileLogger.error('Failed to list available simulators', { error });
          return {
            content: [{
              type: 'text',
              text: `Error: ${error instanceof Error ? error.message : String(error)}`
            }],
            isError: true
          };
        }
      }
    );
    
    // Boot simulator directly by UDID
    this.server.tool(
      'boot-simulator-by-udid',
      {
        udid: z.string()
      },
      async (params) => {
        fileLogger.info(`Booting simulator directly by UDID: ${params.udid}`);
        try {
          const result = await simulatorManager.bootByUDID(params.udid);
          if (result) {
            return {
              content: [{
                type: 'text',
                text: `Successfully booted simulator with UDID: ${params.udid}`
              }]
            };
          } else {
            return {
              content: [{
                type: 'text',
                text: `Failed to boot simulator with UDID: ${params.udid}`
              }],
              isError: true
            };
          }
        } catch (error) {
          fileLogger.error(`Failed to boot simulator by UDID: ${params.udid}`, { error });
          return {
            content: [{
              type: 'text',
              text: `Error: ${error instanceof Error ? error.message : String(error)}`
            }],
            isError: true
          };
        }
      }
    );
    
    // Shutdown simulator by UDID
    this.server.tool(
      'shutdown-simulator-by-udid',
      {
        udid: z.string()
      },
      async (params) => {
        fileLogger.info(`Shutting down simulator directly by UDID: ${params.udid}`);
        try {
          const success = await simulatorManager.directShutdownByUDID(params.udid);
          
          if (!success) {
            return {
              content: [{
                type: 'text',
                text: `Failed to shutdown simulator with UDID: ${params.udid}`
              }],
              isError: true
            };
          }
          
          // Verify shutdown
          const verifySuccess = await simulatorManager.verifySimulatorShutdown(params.udid);
          
          if (!verifySuccess) {
            return {
              content: [{
                type: 'text',
                text: `Simulator shutdown command executed but simulator may still be running. UDID: ${params.udid}`
              }],
              isError: true
            };
          }
          
          return {
            content: [{
              type: 'text',
              text: `Simulator with UDID: ${params.udid} successfully shut down`
            }]
          };
        } catch (error) {
          fileLogger.error(`Failed to shutdown simulator by UDID: ${params.udid}`, { error });
          return {
            content: [{
              type: 'text',
              text: `Error: ${error instanceof Error ? error.message : String(error)}`
            }],
            isError: true
          };
        }
      }
    );
    
    // List all booted simulators
    this.server.tool(
      'list-booted-simulators',
      {},
      async () => {
        fileLogger.info('Listing all booted simulators');
        try {
          const bootedSimulators = await simulatorManager.getBootedSimulators();
          
          // Format as plain text table instead of JSON
          let tableText = "BOOTED SIMULATORS\n";
          tableText += "─────────────────────────────────────────────────────\n";
          tableText += "UDID                                  | NAME          | STATE  | RUNTIME\n";
          tableText += "─────────────────────────────────────────────────────\n";
          
          if (bootedSimulators.length === 0) {
            tableText += "No simulators currently booted.\n";
            tableText += "─────────────────────────────────────────────────────\n";
            tableText += "\n💡 RECOMMENDED WORKFLOW:\n";
            tableText += "1️⃣ FIRST: Use 'list-available-simulators' to see all available devices with their UDIDs\n";
            tableText += "2️⃣ THEN: Use 'boot-simulator-by-udid' with the UDID of your chosen device\n\n";
            tableText += "❌ AVOID creating simulator sessions unless absolutely necessary\n";
          } else {
            bootedSimulators.forEach(sim => {
              tableText += `${sim.udid} | ${sim.name.padEnd(13)} | ${sim.state.padEnd(6)} | ${sim.runtime}\n`;
            });
            tableText += "─────────────────────────────────────────────────────\n";
            tableText += "\n💡 To shut down a simulator, use: shutdown-simulator-by-udid with udid='UDID_FROM_ABOVE'\n";
            tableText += "❌ AVOID using session-based methods like 'shutdown-simulator' or 'terminate-session'\n";
          }
          
          // For debugging, append the original JSON at the bottom
          tableText += "\nOriginal JSON data:\n```\n";
          tableText += JSON.stringify(bootedSimulators, null, 2);
          tableText += "\n```";
          
          return {
            content: [{
              type: 'text',
              text: tableText
            }]
          };
        } catch (error) {
          fileLogger.error('Failed to list booted simulators', { error });
          return {
            content: [{
              type: 'text',
              text: `Error: ${error instanceof Error ? error.message : String(error)}`
            }],
            isError: true
          };
        }
      }
    );
    
    // ====================================================
    // SESSION-BASED SIMULATOR MANAGEMENT (ADVANCED)
    // ====================================================
    // These methods use a session-based approach that tracks simulators
    // with custom session IDs instead of UDIDs.
    // This is more complex but useful for advanced use cases.
    
    // List all simulator sessions
    this.server.tool(
      'list-simulator-sessions',
      {},
      async () => {
        fileLogger.info('Listing all simulator sessions');
        try {
          const sessions = simulatorManager.getAllSessions();
          
          return {
            content: [{
              type: 'text',
              text: JSON.stringify(sessions)
            }]
          };
        } catch (error) {
          fileLogger.error('Failed to list simulator sessions', { error });
          return {
            content: [{
              type: 'text',
              text: `Error: ${error instanceof Error ? error.message : String(error)}`
            }],
            isError: true
          };
        }
      }
    );
    
    // Shutdown simulator
    this.server.tool(
      'shutdown-simulator',
      {
        sessionId: z.string()
      },
      async ({ sessionId }) => {
        fileLogger.info(`Shutting down simulator: ${sessionId}`);
        try {
          const success = await simulatorManager.shutdownSimulator(sessionId);
          
          if (!success) {
            return {
              content: [{
                type: 'text',
                text: `Failed to shutdown simulator for session: ${sessionId}`
              }],
              isError: true
            };
          }
          
          return {
            content: [{
              type: 'text',
              text: `Simulator shutdown for session: ${sessionId}`
            }]
          };
        } catch (error) {
          fileLogger.error(`Failed to shutdown simulator for session: ${sessionId}`, { error });
          return {
            content: [{
              type: 'text',
              text: `Error: ${error instanceof Error ? error.message : String(error)}`
            }],
            isError: true
          };
        }
      }
    );
  }

  /**
   * Register prompts for common simulator operations
   */
  private registerPrompts(): void {
    // Simple prompt for creating a simulator session
    this.server.prompt(
      'create-simulator',
      {
        deviceName: z.string().optional(),
        platformVersion: z.string().optional()
      },
      ({ deviceName, platformVersion }) => ({
        messages: [{
          role: 'user',
          content: {
            type: 'text',
            text: `Create and launch a new iOS simulator${deviceName ? ` with device ${deviceName}` : ''}${platformVersion ? ` running iOS ${platformVersion}` : ''}.`
          }
        }]
      })
    );
    
    // Prompt for installing and running an app
    this.server.prompt(
      'install-and-run-app',
      {
        sessionId: z.string(),
        appPath: z.string(),
        bundleId: z.string()
      },
      ({ sessionId, appPath, bundleId }) => ({
        messages: [{
          role: 'user',
          content: {
            type: 'text',
            text: `For simulator session ${sessionId}:
1. Install the app from ${appPath}
2. Launch the app with bundle ID ${bundleId}
3. Take a screenshot of the running app`
          }
        }]
      })
    );
    
    // Add a dedicated prompt for booting a simulator by name and iOS version
    this.server.prompt(
      'boot-simulator-by-name',
      {
        deviceName: z.string(),
        iosVersion: z.string().optional()
      },
      async ({ deviceName, iosVersion }) => {
        fileLogger.info(`Handling boot-simulator-by-name prompt with deviceName: ${deviceName || 'any'}, iosVersion: ${iosVersion || 'latest'}`);
        
        // Get all available simulators
        const availableSimulators = await simulatorManager.getAllSimulators();
        
        // Find the best matching simulator
        let matchingSimulator;
        let matchMessage = "";
        
        // First try exact match with device name and iOS version if provided
        if (deviceName && iosVersion) {
          matchingSimulator = availableSimulators.find(sim => 
            sim.name.toLowerCase() === deviceName.toLowerCase() && 
            sim.runtime.includes(iosVersion.replace(/\./g, '-'))
          );
          
          if (matchingSimulator) {
            matchMessage = `Found exact match for ${deviceName} with iOS ${iosVersion}`;
          }
        }
        
        // If no match yet, try just device name
        if (deviceName && !matchingSimulator) {
          matchingSimulator = availableSimulators.find(sim => 
            sim.name.toLowerCase() === deviceName.toLowerCase()
          );
          
          if (matchingSimulator) {
            matchMessage = `Found exact match for ${deviceName}`;
          }
        }
        
        // If still no match, try contains for device name
        if (deviceName && !matchingSimulator) {
          // Sort by name to prioritize more specific matches
          const candidateSimulators = availableSimulators
            .filter(sim => sim.name.toLowerCase().includes(deviceName.toLowerCase()))
            .sort((a, b) => a.name.length - b.name.length);
          
          if (candidateSimulators.length > 0) {
            // If iOS version provided, try to find a match with that version first
            if (iosVersion) {
              matchingSimulator = candidateSimulators.find(sim => 
                sim.runtime.includes(iosVersion.replace(/\./g, '-'))
              );
              
              if (matchingSimulator) {
                matchMessage = `Found partial match for "${deviceName}" with iOS ${iosVersion}: ${matchingSimulator.name}`;
              }
            }
            
            // If still no match, just take the first match
            if (!matchingSimulator) {
              matchingSimulator = candidateSimulators[0];
              matchMessage = `Found best match for "${deviceName}": ${matchingSimulator.name}`;
            }
          }
        }
        
        if (!matchingSimulator) {
          return {
            messages: [{
              role: 'user',
              content: {
                type: 'text',
                text: `list-available-simulators`
              }
            }]
          };
        }
        
        // Found a matching simulator, boot it using UDID
        return {
          messages: [{
            role: 'user',
            content: {
              type: 'text',
              text: `boot-simulator-by-udid with udid='${matchingSimulator.udid}'`
            }
          }]
        };
      }
    );
  }

  /**
   * Start the server with stdio transport
   */
  async start(): Promise<void> {
    fileLogger.info('Starting MCP server with stdio transport');
    
    try {
      // Create stdio transport and connect
      const transport = new StdioServerTransport();
      await this.server.connect(transport);
      
      fileLogger.info('MCP server started with stdio transport');
    } catch (error) {
      fileLogger.error(`Failed to start MCP server with stdio transport: ${error}`);
      throw error;
    }
  }

  /**
   * Stop the server and clean up resources
   */
  async stop(): Promise<void> {
    fileLogger.info('Stopping MCP server');
    
    try {
      // The McpServer may not have a direct method to disconnect all transports
      // This is a graceful shutdown that simply logs the action
      fileLogger.info('MCP server stopped');
    } catch (error) {
      fileLogger.error(`Failed to stop MCP server: ${error}`);
      throw error;
    }
  }
}

export default new SimulatorMcpServer(); 