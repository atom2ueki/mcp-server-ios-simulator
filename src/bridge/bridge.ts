import logger from '../utils/logger';
import simulatorManager from '../simulator/simulator-manager';
import mcpServer from '../mcp/mcp-server';

/**
 * Bridge class that connects the different components of the system:
 * - MCP Server (for LLM interactions)
 * - Simulator Manager (for controlling iOS simulators)
 */
class SimulatorBridge {
  /**
   * Initializes the bridge and starts all components
   */
  async initialize(): Promise<void> {
    try {
      logger.info('Initializing SimulatorBridge');
      
      // Start the MCP server
      await mcpServer.start();
      
      logger.info('SimulatorBridge initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize SimulatorBridge', { error });
      throw error;
    }
  }

  /**
   * Shuts down the bridge and all components
   */
  async shutdown(): Promise<void> {
    try {
      logger.info('Shutting down SimulatorBridge');
      
      // Stop the MCP server
      await mcpServer.stop();
      
      logger.info('SimulatorBridge shutdown successfully');
    } catch (error) {
      logger.error('Failed to shutdown SimulatorBridge', { error });
      throw error;
    }
  }

  /**
   * Creates a new simulator session
   */
  async createSimulatorSession(deviceName?: string, platformVersion?: string, timeout?: number): Promise<string> {
    try {
      const session = await simulatorManager.createSession({
        deviceName,
        platformVersion,
        timeout
      });
      
      logger.info(`Created simulator session: ${session.id}`);
      return session.id;
    } catch (error) {
      logger.error('Failed to create simulator session', { error, deviceName, platformVersion });
      throw error;
    }
  }

  /**
   * Terminates a simulator session
   */
  async terminateSimulatorSession(sessionId: string): Promise<boolean> {
    try {
      const success = await simulatorManager.terminateSession(sessionId);
      
      if (success) {
        logger.info(`Terminated simulator session: ${sessionId}`);
      } else {
        logger.warn(`Failed to terminate simulator session: ${sessionId}`);
      }
      
      return success;
    } catch (error) {
      logger.error('Failed to terminate simulator session', { error, sessionId });
      throw error;
    }
  }
}

export default new SimulatorBridge(); 