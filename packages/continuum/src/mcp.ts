/** MCP (Model Context Protocol) client. */

export interface McpTool {
  name: string;
  description: string;
}

export interface McpConfig {
  endpoint?: string;
}

/** The MCP client surface. */
export interface McpClient {
  listTools(): Promise<McpTool[]>;
  callTool(name: string, args: unknown): Promise<string>;
}

/** Offline MCP client exposing one echo tool. */
export class SimulatedMcp implements McpClient {
  async listTools(): Promise<McpTool[]> {
    return [{ name: 'echo', description: 'Echoes its arguments back as text.' }];
  }

  async callTool(name: string, args: unknown): Promise<string> {
    if (name !== 'echo') throw new Error(`unknown tool: ${name}`);
    return JSON.stringify(args);
  }
}

const httpDisabled = (): Error =>
  new Error('continuum HTTP transport is not enabled in this build');

class NotEnabledMcp implements McpClient {
  listTools(): Promise<McpTool[]> {
    return Promise.reject(httpDisabled());
  }
  callTool(): Promise<string> {
    return Promise.reject(httpDisabled());
  }
}

/** Builds an MCP client: simulated when no endpoint is configured. */
export function createMcpClient(config: McpConfig = {}): McpClient {
  return config.endpoint ? new NotEnabledMcp() : new SimulatedMcp();
}
