# MCP Server for iOS Simulator

A server that implements the Model Context Protocol (MCP) for iOS simulators, built on top of [appium-ios-simulator](https://github.com/appium/appium-ios-simulator) and utilizing the [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk).

## Overview

This project provides a bridge between iOS simulators and the Model Context Protocol, allowing for standardized communication with iOS simulator instances. It enables programmatic control of iOS simulators while leveraging the MCP protocol for consistent interfaces across different environments.

## Architecture

The server consists of three main components:

1. **Simulator Management Layer** - Handles iOS simulator lifecycle and interactions
2. **MCP Protocol Implementation** - Implements the Model Context Protocol using the TypeScript SDK
3. **Bridge Component** - Maps between MCP operations and simulator commands

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  MCP Protocol   │     │      Bridge     │     │    Simulator    │
│  Implementation │◄────┤    Component    │◄────┤   Management    │
│                 │     │                 │     │      Layer      │
└─────────────────┘     └─────────────────┘     └─────────────────┘
        ▲                                                ▲
        │                                                │
        ▼                                                ▼
┌─────────────────┐                             ┌─────────────────┐
│   MCP Client    │                             │  iOS Simulator  │
│                 │                             │                 │
└─────────────────┘                             └─────────────────┘
```

## Features

- Start, stop, and manage iOS simulator instances
- Install and launch applications on simulators
- Execute MCP operations against running simulator instances
- Bridge between MCP protocol operations and simulator commands
- Support for multiple concurrent simulator sessions
- Comprehensive logging and error reporting

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

Create a `config.json` file or use environment variables to configure the server:

```json
{
  "simulator": {
    "defaultDevice": "iPhone 14",
    "defaultOS": "16.4",
    "timeout": 30000
  },
  "mcp": {
    "port": 8080,
    "logLevel": "info"
  },
  "server": {
    "host": "localhost",
    "port": 3001
  }
}
```

Alternatively, you can use environment variables:

```
SIMULATOR_DEFAULT_DEVICE=iPhone 14
SIMULATOR_DEFAULT_OS=16.4
SIMULATOR_TIMEOUT=30000
MCP_PORT=8080
MCP_LOG_LEVEL=info
SERVER_HOST=localhost
SERVER_PORT=3001
```

## Usage

### Starting the Server

```bash
# Build the project
npm run build

# Start the server
npm start
```

### API Endpoints

The server exposes the following API endpoints:

- `POST /sessions` - Create a new simulator session
- `DELETE /sessions/:id` - Terminate a simulator session
- `POST /sessions/:id/apps` - Install an app on a simulator
- `POST /sessions/:id/apps/:bundleId/launch` - Launch an app on a simulator
- `POST /sessions/:id/mcp` - Execute an MCP operation on a simulator

### MCP Operations

MCP operations can be performed by sending requests to the `/sessions/:id/mcp` endpoint. The request body should contain the MCP operation payload as defined by the MCP specification.

Example:

```json
{
  "operation": "executeAction",
  "parameters": {
    "action": "tap",
    "element": {
      "id": "login-button"
    }
  }
}
```

## Development

### Project Structure

```
src/
├── simulator/       # Simulator management layer
├── mcp/             # MCP protocol implementation
├── bridge/          # Bridge component
├── api/             # API server layer
├── utils/           # Utility functions
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

### Running Tests

```bash
# Run all tests
npm test
```

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- [appium-ios-simulator](https://github.com/appium/appium-ios-simulator) for providing the iOS simulator interaction capabilities
- [Model Context Protocol](https://github.com/modelcontextprotocol/typescript-sdk) for the protocol specification and TypeScript SDK