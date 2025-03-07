# MCP Server for iOS Simulator

A server that implements the Model Context Protocol (MCP) for iOS simulators, built on top of [appium-ios-simulator](https://github.com/appium/appium-ios-simulator) and utilizing the [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk).

## Overview

This project provides a bridge between iOS simulators and the Model Context Protocol, allowing for standardized communication with iOS simulator instances. It enables programmatic control of iOS simulators while leveraging the MCP protocol for consistent interfaces across different environments. The server utilizes stdio as its transport mechanism, making it ideal for integration with Claude Desktop and other MCP-compatible clients.

## Architecture

The server consists of three main components:

1. **Simulator Management Layer** - Handles iOS simulator lifecycle and interactions
2. **MCP Protocol Implementation** - Implements the Model Context Protocol using the TypeScript SDK with stdio transport
3. **Logger Component** - Provides file-based logging without interfering with the stdio transport

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  MCP Protocol   │     │     Stdio       │     │    Simulator    │
│  Implementation │◄────┤    Transport    │◄────┤   Management    │
│                 │     │                 │     │      Layer      │
└─────────────────┘     └─────────────────┘     └─────────────────┘
        ▲                                                ▲
        │                                                │
        ▼                                                ▼
┌─────────────────┐                             ┌─────────────────┐
│   MCP Client    │                             │  iOS Simulator  │
│  (e.g. Claude)  │                             │                 │
└─────────────────┘                             └─────────────────┘
```

## Features

- Start, stop, and manage iOS simulator instances
- Boot and shutdown simulators
- Install and launch applications on simulators
- Take screenshots of simulator screens
- Perform taps on coordinates
- Support for multiple concurrent simulator sessions
- Comprehensive file-based logging without console output
- Error-resilient operation

## Prerequisites

- Node.js (v16 or later)
- macOS (required for iOS simulators)
- Xcode with iOS simulators installed
- TypeScript 4.5+

## Installation

```bash
# Clone the repository
git clone https://github.com/atom2ueki/mcp-server-ios-simulator.git
cd mcp-server-ios-simulator

# Install dependencies
npm install
```

## Configuration

Configuration is handled through the `src/config.ts` file:

```typescript
const config = {
  simulator: {
    defaultDevice: process.env.SIMULATOR_DEFAULT_DEVICE || 'iPhone 16',
    defaultOS: process.env.SIMULATOR_DEFAULT_OS || '18.2',
    timeout: parseInt(process.env.SIMULATOR_TIMEOUT || '30000', 10),
  }
};
```

You can customize these settings by setting environment variables:

```
SIMULATOR_DEFAULT_DEVICE=iPhone 16
SIMULATOR_DEFAULT_OS=18.2
SIMULATOR_TIMEOUT=30000
```

## Usage

### Building and Starting the Server

```bash
# Build the project
npm run build

# Start the server
npm start
```

### MCP Tools

The server provides the following MCP tools:

#### Simulator Session Management
- `list-simulator-sessions` - List all active simulator sessions
- `create-simulator-session` - Create a new simulator session with optional device and OS parameters
- `terminate-simulator-session` - Terminate an existing simulator session
- `create-and-boot-simulator` - Create a new simulator session and boot it in one step

#### Simulator Control
- `boot-simulator` - Boot a simulator by session ID
- `shutdown-simulator` - Shutdown a simulator by session ID
- `shutdown-simulator-by-udid` - Shutdown a simulator directly using its UDID
- `list-booted-simulators` - List all currently booted simulators

#### Application Management
- `install-app` - Install an application on a simulator
- `launch-app` - Launch an application on a simulator
- `terminate-app` - Terminate a running application on a simulator

#### Interaction Tools
- `take-screenshot` - Take a screenshot of the simulator screen
- `tap-coordinate` - Perform a tap at the specified coordinates

### Example Usage with Claude Desktop

1. Configure Claude Desktop to use this server as an MCP tool
2. Use the provided tools to control iOS simulators directly from Claude Desktop

## Development

### Project Structure

```
src/
├── simulator/       # Simulator management layer
├── mcp/             # MCP protocol implementation
├── bridge/          # Bridge component
├── utils/           # Utility functions including logger
├── config.ts        # Configuration handling
└── index.ts         # Entry point
```

### Building the Project

```bash
# Install development dependencies
npm install

# Run TypeScript compiler
npm run build
```

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- [appium-ios-simulator](https://github.com/appium/appium-ios-simulator) for providing the iOS simulator interaction capabilities
- [Model Context Protocol](https://github.com/modelcontextprotocol/typescript-sdk) for the protocol specification and TypeScript SDK